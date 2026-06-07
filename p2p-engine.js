const EventEmitter = require('events');
const ndc = require('node-datachannel');

class P2PEngine extends EventEmitter {
    constructor(pool) {
        super();
        this.pool = pool;
        this.activePeers = new Map(); // sessionId → { pc, dc, icePollInterval }
    }

    _iceServers() {
        return [
            { hostname: 'stun.l.google.com', port: 19302 },
            { hostname: 'stun1.l.google.com', port: 19302 },
        ];
    }

    async _query(text, params) {
        const client = await this.pool.connect();
        try { return (await client.query(text, params)).rows; }
        finally { client.release(); }
    }

    async createOffer(sessionId, hostUserId, guestUserId, mcPort) {
        const pc = new ndc.PeerConnection('P2PHost', { iceServers: this._iceServers() });
        const dc = pc.createDataChannel('minecraft-tunnel');

        const entry = { pc, dc, icePollInterval: null };
        this.activePeers.set(sessionId, entry);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('SDP offer timeout')), 15000);

            pc.onLocalDescription((sdp, type) => {
                if (type === 'offer') {
                    this._query(
                        `UPDATE p2p_sessions SET offer_sdp = $2, status = 'OFFERED', updated_at = NOW() WHERE session_id = $1`,
                        [sessionId, sdp]
                    ).then(() => {
                        clearTimeout(timeout);
                        resolve({ offer: sdp });
                    }).catch(reject);
                }
            });

            pc.onLocalCandidate((candidate, mid) => {
                const c = { candidate, mid };
                this._query(
                    `UPDATE p2p_sessions SET host_ice = host_ice || $2::jsonb, updated_at = NOW() WHERE session_id = $1`,
                    [sessionId, JSON.stringify([c])]
                ).catch(() => {});
            });

            dc.onOpen(() => {
                this.emit('channel-open', sessionId, dc);
            });

            dc.onClosed(() => {
                this.emit('channel-closed', sessionId);
                this.activePeers.delete(sessionId);
            });

            dc.onError((err) => {
                console.error('[P2P] DataChannel error:', err);
            });

            pc.setLocalDescription('offer');
        });
    }

    async waitForAnswer(sessionId, timeoutMs = 60000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const rows = await this._query(
                `SELECT answer_sdp, status FROM p2p_sessions WHERE session_id = $1`,
                [sessionId]
            );
            const row = rows[0];
            if (row && row.answer_sdp) {
                const entry = this.activePeers.get(sessionId);
                if (entry) {
                    entry.pc.setRemoteDescription(row.answer_sdp, 'answer');
                }
                return { answer: row.answer_sdp };
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error('Timeout waiting for answer');
    }

    async createAnswer(sessionId, guestUserId) {
        const rows = await this._query(
            `SELECT offer_sdp FROM p2p_sessions WHERE session_id = $1`, [sessionId]
        );
        if (!rows[0]?.offer_sdp) throw new Error('No offer found');

        const pc = new ndc.PeerConnection('P2PGuest', { iceServers: this._iceServers() });
        const entry = { pc, dc: null, icePollInterval: null };
        this.activePeers.set(sessionId, entry);

        pc.setRemoteDescription(rows[0].offer_sdp, 'offer');

        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('SDP answer timeout')), 15000);

            pc.onLocalDescription((sdp, type) => {
                if (type === 'answer') {
                    this._query(
                        `UPDATE p2p_sessions SET answer_sdp = $2, status = 'ANSWERED', updated_at = NOW() WHERE session_id = $1`,
                        [sessionId, sdp]
                    ).then(() => {
                        clearTimeout(timeout);
                        resolve({ answer: sdp, offer: rows[0].offer_sdp });
                    }).catch(reject);
                }
            });

            pc.onLocalCandidate((candidate, mid) => {
                const c = { candidate, mid };
                this._query(
                    `UPDATE p2p_sessions SET guest_ice = guest_ice || $2::jsonb, updated_at = NOW() WHERE session_id = $1`,
                    [sessionId, JSON.stringify([c])]
                ).catch(() => {});
            });

            pc.onDataChannel((dc) => {
                entry.dc = dc;
                dc.onOpen(() => {
                    this.emit('channel-open', sessionId, dc);
                });
                dc.onClosed(() => {
                    this.emit('channel-closed', sessionId);
                    this.activePeers.delete(sessionId);
                });
                dc.onError((err) => console.error('[P2P] Guest DC error:', err));
            });

            pc.setLocalDescription('answer');
        });

        return result;
    }

    async pollHostCandidates(sessionId, onCandidate) {
        let knownCount = 0;
        const poll = async () => {
            try {
                const rows = await this._query(
                    `SELECT host_ice FROM p2p_sessions WHERE session_id = $1`, [sessionId]
                );
                const ice = rows[0]?.host_ice || [];
                while (knownCount < ice.length) {
                    const c = ice[knownCount];
                    if (c.candidate && c.mid) {
                        const entry = this.activePeers.get(sessionId);
                        if (entry) entry.pc.addRemoteCandidate(c.candidate, c.mid);
                    }
                    knownCount++;
                }
            } catch (_) {}
        };
        const interval = setInterval(poll, 1000);
        const entry = this.activePeers.get(sessionId);
        if (entry) entry.icePollInterval = interval;
        poll();
        return () => clearInterval(interval);
    }

    async pollGuestCandidates(sessionId, onCandidate) {
        let knownCount = 0;
        const poll = async () => {
            try {
                const rows = await this._query(
                    `SELECT guest_ice FROM p2p_sessions WHERE session_id = $1`, [sessionId]
                );
                const ice = rows[0]?.guest_ice || [];
                while (knownCount < ice.length) {
                    const c = ice[knownCount];
                    if (c.candidate && c.mid) {
                        const entry = this.activePeers.get(sessionId);
                        if (entry) entry.pc.addRemoteCandidate(c.candidate, c.mid);
                    }
                    knownCount++;
                }
            } catch (_) {}
        };
        const interval = setInterval(poll, 1000);
        const entry = this.activePeers.get(sessionId);
        if (entry) entry.icePollInterval = interval;
        poll();
        return () => clearInterval(interval);
    }

    async closeSession(sessionId) {
        const entry = this.activePeers.get(sessionId);
        if (entry) {
            if (entry.icePollInterval) clearInterval(entry.icePollInterval);
            try { entry.dc?.close(); } catch (_) {}
            try { entry.pc?.close(); } catch (_) {}
            this.activePeers.delete(sessionId);
        }
        await this._query(
            `UPDATE p2p_sessions SET status = 'CLOSED', updated_at = NOW() WHERE session_id = $1`,
            [sessionId]
        );
    }
}

module.exports = P2PEngine;
