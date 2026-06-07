const { Pool } = require('pg');

class SocialDB {
    constructor() {
        this.pool = null;
        this.connected = false;
    }

    connect(connectionString) {
        try {
            this.pool = new Pool({
                connectionString,
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000
            });
            this.connected = true;
            return { success: true };
        } catch (e) {
            this.connected = false;
            return { success: false, error: e.message };
        }
    }

    async query(text, params) {
        if (!this.pool) throw new Error('DB not connected');
        const client = await this.pool.connect();
        try {
            const res = await client.query(text, params);
            return res;
        } finally {
            client.release();
        }
    }

    async ping() {
        try {
            await this.query('SELECT 1');
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async close() {
        if (this.pool) await this.pool.end();
        this.connected = false;
        this.pool = null;
    }

    // ── Auth ──
    async createUser(username, passwordHash) {
        const res = await this.query(
            `INSERT INTO users (username, password_hash) VALUES ($1, $2)
             RETURNING id, username, created_at, is_guest`,
            [username, passwordHash]
        );
        return res.rows[0];
    }

    async createGuestUser(username) {
        const hash = 'guest-' + Math.random().toString(36).slice(2);
        const res = await this.query(
            `INSERT INTO users (username, password_hash, is_guest, guest_expires_at)
             VALUES ($1, $2, TRUE, NOW() + INTERVAL '24 hours')
             RETURNING id, username, is_guest, guest_expires_at`,
            [username, hash]
        );
        return res.rows[0];
    }

    async getUserByUsername(username) {
        const res = await this.query('SELECT * FROM users WHERE username = $1', [username]);
        return res.rows[0] || null;
    }

    async getUserById(id) {
        const res = await this.query('SELECT id, username, avatar_url, created_at, is_guest FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
    }

    async searchUsers(query, limit = 10) {
        const res = await this.query(
            `SELECT id, username FROM users
             WHERE username ILIKE $1 AND is_guest = FALSE
             ORDER BY username LIMIT $2`,
            [query + '%', limit]
        );
        return res.rows;
    }

    async deleteUser(id) {
        await this.query('DELETE FROM users WHERE id = $1', [id]);
    }

    // ── Sessions ──
    async createSession(userId, launcherId) {
        const res = await this.query(
            `INSERT INTO sessions (user_id, launcher_id) VALUES ($1, $2)
             RETURNING token, user_id, connected_at`,
            [userId, launcherId]
        );
        return res.rows[0];
    }

    async getSession(token) {
        const res = await this.query(
            `SELECT s.*, u.username, u.avatar_url FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.token = $1`,
            [token]
        );
        return res.rows[0] || null;
    }

    async deleteSession(token) {
        await this.query('DELETE FROM sessions WHERE token = $1', [token]);
    }

    async heartbeat(token) {
        await this.query(
            `UPDATE sessions SET last_heartbeat = NOW() WHERE token = $1`,
            [token]
        );
    }

    // ── Friends ──
    async sendFriendRequest(fromId, toId) {
        await this.query(
            `INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2)`,
            [fromId, toId]
        );
        await this.query(
            `INSERT INTO friends (user_id, friend_id, status, action_user_id)
             VALUES ($1, $2, 'pending', $1), ($2, $1, 'pending', $1)
             ON CONFLICT DO NOTHING`,
            [fromId, toId]
        );
    }

    async acceptFriendRequest(requestId) {
        const req = await this.query(
            `UPDATE friend_requests SET status = 'accepted', updated_at = NOW()
             WHERE id = $1 AND status = 'pending' RETURNING from_user_id, to_user_id`,
            [requestId]
        );
        if (req.rows.length > 0) {
            const { from_user_id, to_user_id } = req.rows[0];
            await this.query(
                `UPDATE friends SET status = 'accepted'
                 WHERE (user_id = $1 AND friend_id = $2)
                    OR (user_id = $2 AND friend_id = $1)`,
                [from_user_id, to_user_id]
            );
        }
        return req.rows[0] || null;
    }

    async rejectFriendRequest(requestId) {
        const req = await this.query(
            `UPDATE friend_requests SET status = 'rejected', updated_at = NOW()
             WHERE id = $1 AND status = 'pending' RETURNING from_user_id, to_user_id`,
            [requestId]
        );
        if (req.rows.length > 0) {
            const { from_user_id, to_user_id } = req.rows[0];
            await this.query(
                `DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2)
                    OR (user_id = $2 AND friend_id = $1)`,
                [from_user_id, to_user_id]
            );
        }
        return req.rows[0] || null;
    }

    async removeFriend(userId, friendId) {
        await this.query(
            `DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2)
                OR (user_id = $2 AND friend_id = $1)`,
            [userId, friendId]
        );
    }

    async listFriends(userId) {
        const res = await this.query(
            `SELECT u.id, u.username, u.avatar_url,
                    COALESCE(us.status, 'offline') AS status,
                    us.last_updated, us.custom_status
             FROM friends f
             JOIN users u ON u.id = f.friend_id
             LEFT JOIN user_status us ON us.user_id = f.friend_id
             WHERE f.user_id = $1 AND f.status = 'accepted'
             ORDER BY u.username`,
            [userId]
        );
        return res.rows;
    }

    async getPendingRequests(userId) {
        const res = await this.query(
            `SELECT fr.id, fr.from_user_id, u.username, u.avatar_url, fr.created_at
             FROM friend_requests fr
             JOIN users u ON u.id = fr.from_user_id
             WHERE fr.to_user_id = $1 AND fr.status = 'pending'
             ORDER BY fr.created_at DESC`,
            [userId]
        );
        return res.rows;
    }

    async getSentRequests(userId) {
        const res = await this.query(
            `SELECT fr.id, fr.to_user_id, u.username, u.avatar_url, fr.status, fr.created_at
             FROM friend_requests fr
             JOIN users u ON u.id = fr.to_user_id
             WHERE fr.from_user_id = $1
             ORDER BY fr.created_at DESC`,
            [userId]
        );
        return res.rows;
    }

    // ── Conversations / Messages ──
    async getOrCreateDuoConversation(user1Id, user2Id) {
        const res = await this.query(
            `SELECT c.id FROM conversations c
             JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
             JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
             WHERE c.type = 'duo'`,
            [user1Id, user2Id]
        );
        if (res.rows.length > 0) return res.rows[0].id;

        const conv = await this.query(
            `INSERT INTO conversations (type) VALUES ('duo') RETURNING id`
        );
        const convId = conv.rows[0].id;
        await this.query(
            `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
            [convId, user1Id, user2Id]
        );
        return convId;
    }

    async sendMessage(conversationId, senderId, content) {
        const res = await this.query(
            `INSERT INTO messages (conversation_id, sender_id, content)
             VALUES ($1, $2, $3) RETURNING *`,
            [conversationId, senderId, content]
        );
        return res.rows[0];
    }

    async getMessages(conversationId, limit = 50, beforeId = null) {
        let query = `SELECT m.*, u.username AS sender_name
                     FROM messages m
                     JOIN users u ON u.id = m.sender_id
                     WHERE m.conversation_id = $1`;
        const params = [conversationId];
        if (beforeId) {
            params.push(beforeId);
            query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)`;
        }
        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        const res = await this.query(query, params);
        return res.rows.reverse();
    }

    async getConversations(userId) {
        const res = await this.query(
            `SELECT c.id, c.type, c.created_at,
                    (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                    (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
                    (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'username', u.username))
                     FROM conversation_participants cp2
                     JOIN users u ON u.id = cp2.user_id
                     WHERE cp2.conversation_id = c.id AND cp2.user_id != $1) AS other_users,
                    (SELECT COUNT(*)::int FROM messages m
                     WHERE m.conversation_id = c.id AND m.sender_id != $1
                       AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $1)) AS unread_count
             FROM conversation_participants cp
             JOIN conversations c ON c.id = cp.conversation_id
             WHERE cp.user_id = $1
             ORDER BY last_message_at DESC NULLS LAST`,
            [userId]
        );
        return res.rows;
    }

    async markMessagesRead(conversationId, userId, upToMessageId) {
        let query = `INSERT INTO message_reads (message_id, user_id)
                     SELECT m.id, $2 FROM messages m
                     WHERE m.conversation_id = $1
                       AND m.sender_id != $2
                       AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)
                     ON CONFLICT DO NOTHING`;
        const params = [conversationId, userId];
        if (upToMessageId) {
            params.push(upToMessageId);
            query = `INSERT INTO message_reads (message_id, user_id)
                     SELECT m.id, $2 FROM messages m
                     WHERE m.conversation_id = $1
                       AND m.sender_id != $2
                       AND m.created_at <= (SELECT created_at FROM messages WHERE id = $3)
                       AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)
                     ON CONFLICT DO NOTHING`;
        }
        await this.query(query, params);
    }

    async getUnreadCount(userId, conversationId) {
        const res = await this.query(
            `SELECT COUNT(*)::int AS count FROM messages m
             WHERE m.conversation_id = $1 AND m.sender_id != $2
               AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)`,
            [conversationId, userId]
        );
        return res.rows[0].count;
    }

    // ── Presence ──
    async updateStatus(userId, status, customStatus) {
        await this.query(
            `INSERT INTO user_status (user_id, status, last_updated, custom_status)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (user_id)
             DO UPDATE SET status = $2, last_updated = NOW(), custom_status = COALESCE($3, user_status.custom_status)`,
            [userId, status, customStatus || '']
        );
    }

    async getFriendStatus(userId, friendId) {
        const res = await this.query(
            `SELECT us.status, us.last_updated, us.custom_status, u.last_seen
             FROM user_status us
             JOIN users u ON u.id = us.user_id
             WHERE us.user_id = $1
             AND EXISTS (SELECT 1 FROM friends f
                         WHERE f.user_id = $2 AND f.friend_id = $1 AND f.status = 'accepted')`,
            [friendId, userId]
        );
        return res.rows[0] || null;
    }

    async getOnlineFriends(userId) {
        const res = await this.query(
            `SELECT u.id, u.username, u.avatar_url, us.status, us.custom_status, us.last_updated
             FROM friends f
             JOIN users u ON u.id = f.friend_id
             JOIN user_status us ON us.user_id = f.friend_id
             WHERE f.user_id = $1 AND f.status = 'accepted'
               AND us.status IN ('online', 'away')
             ORDER BY u.username`,
            [userId]
        );
        return res.rows;
    }

    // ── P2P Signaling ──
    async createP2PSession(callerId, calleeId, signalData) {
        const res = await this.query(
            `INSERT INTO p2p_sessions (caller_id, callee_id, signal_data)
             VALUES ($1, $2, $3::jsonb) RETURNING *`,
            [callerId, calleeId, JSON.stringify(signalData)]
        );
        return res.rows[0];
    }

    async updateP2PSession(id, signalData) {
        await this.query(
            `UPDATE p2p_sessions SET signal_data = $1::jsonb WHERE id = $2`,
            [JSON.stringify(signalData), id]
        );
    }

    async endP2PSession(id) {
        await this.query(
            `UPDATE p2p_sessions SET status = 'ended', ended_at = NOW() WHERE id = $1`,
            [id]
        );
    }

    async getActiveP2PSession(userId) {
        const res = await this.query(
            `SELECT * FROM p2p_sessions
             WHERE (caller_id = $1 OR callee_id = $1)
               AND status IN ('ringing', 'connected')
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        return res.rows[0] || null;
    }

    async getP2PIncomingSessions(userId) {
        const res = await this.query(
            `SELECT ps.*, u.username AS caller_name
             FROM p2p_sessions ps
             JOIN users u ON u.id = ps.caller_id
             WHERE ps.callee_id = $1 AND ps.status = 'ringing'
             ORDER BY ps.created_at DESC`,
            [userId]
        );
        return res.rows;
    }

    // ── Schema migration ──
    async migrateSchema() {
        try {
            await this.query(`ALTER TABLE user_status ALTER COLUMN status TYPE VARCHAR(30)`);
            await this.query(`ALTER TABLE user_status DROP CONSTRAINT IF EXISTS user_status_status_check`);
            await this.query(`ALTER TABLE user_status ADD CONSTRAINT user_status_status_check
                CHECK (status IN ('online','away','dnd','offline','playing_singleplayer','playing_multiplayer','menu'))`);
            console.log('[SOCIAL] Schema migrated: user_status check updated');
        } catch (e) {
            if (e.message && e.message.includes('already exists')) return;
            console.warn('[SOCIAL] Schema migration (non-fatal):', e.message);
        }
        try {
            await this.query(`CREATE TABLE IF NOT EXISTS user_presence (
                user_id  INTEGER PRIMARY KEY,
                status   TEXT NOT NULL DEFAULT 'OFFLINE',
                server_ip  TEXT,
                version    TEXT,
                last_seen  TIMESTAMPTZ DEFAULT NOW()
            )`);
            console.log('[SOCIAL] Schema migrated: user_presence table created');
        } catch (e) {
            console.warn('[SOCIAL] user_presence migration (non-fatal):', e.message);
        }
        try {
            await this.query(`CREATE TABLE IF NOT EXISTS game_invitations (
                id SERIAL PRIMARY KEY,
                from_user_id VARCHAR(100) NOT NULL,
                to_user_id VARCHAR(100) NOT NULL,
                world_name VARCHAR(100) DEFAULT 'su mundo',
                server_ip VARCHAR(100),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )`);
            console.log('[SOCIAL] Schema migrated: game_invitations table created');
        } catch (e) {
            console.warn('[SOCIAL] game_invitations migration (non-fatal):', e.message);
        }
        try {
            await this.query(`ALTER TABLE game_invitations ADD COLUMN IF NOT EXISTS server_ip VARCHAR(100)`);
            console.log('[SOCIAL] Schema migrated: game_invitations.server_ip column added');
        } catch (e) {
            console.warn('[SOCIAL] game_invitations.server_ip migration (non-fatal):', e.message);
        }
        try {
            await this.query(`ALTER TABLE game_invitations ALTER COLUMN from_user_id TYPE VARCHAR(100) USING from_user_id::VARCHAR(100)`);
            await this.query(`ALTER TABLE game_invitations ALTER COLUMN to_user_id TYPE VARCHAR(100) USING to_user_id::VARCHAR(100)`);
            console.log('[SOCIAL] Schema migrated: game_invitations user_id columns -> VARCHAR');
        } catch (e) {
            console.warn('[SOCIAL] game_invitations user_id migration (non-fatal):', e.message);
        }
        try {
            await this.query(`ALTER TABLE game_invitations ADD COLUMN IF NOT EXISTS p2p_session_id TEXT`);
            console.log('[SOCIAL] Schema migrated: game_invitations.p2p_session_id column added');
        } catch (e) {
            console.warn('[SOCIAL] game_invitations.p2p_session_id migration (non-fatal):', e.message);
        }
        try {
            await this.query(`CREATE TABLE IF NOT EXISTS p2p_sessions (
                id            SERIAL PRIMARY KEY,
                session_id    TEXT UNIQUE NOT NULL,
                host_user_id  TEXT NOT NULL,
                guest_user_id TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT 'PENDING',
                offer_sdp     TEXT,
                answer_sdp    TEXT,
                host_ice      JSONB DEFAULT '[]'::jsonb,
                guest_ice     JSONB DEFAULT '[]'::jsonb,
                mc_port       INTEGER DEFAULT 25565,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                updated_at    TIMESTAMPTZ DEFAULT NOW()
            )`);
            console.log('[SOCIAL] Schema migrated: p2p_sessions table created');
        } catch (e) {
            console.warn('[SOCIAL] p2p_sessions migration (non-fatal):', e.message);
        }
        try {
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS host_user_id TEXT`);
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS guest_user_id TEXT`);
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS offer_sdp TEXT`);
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS answer_sdp TEXT`);
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS host_ice JSONB DEFAULT '[]'::jsonb`);
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS guest_ice JSONB DEFAULT '[]'::jsonb`);
            await this.query(`ALTER TABLE p2p_sessions ADD COLUMN IF NOT EXISTS mc_port INTEGER DEFAULT 25565`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_p2p_guest ON p2p_sessions(guest_user_id, status)`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_p2p_host  ON p2p_sessions(host_user_id, status)`);
            console.log('[SOCIAL] Schema migrated: p2p_sessions columns verified');
        } catch (e) {
            console.warn('[SOCIAL] p2p_sessions columns migration (non-fatal):', e.message);
        }
        try {
            await this.query(`DELETE FROM p2p_sessions WHERE created_at < NOW() - INTERVAL '1 hour'`);
        } catch (e) { /* table may not exist yet */ }
    }

    // ── P2P Sessions ──
    async createP2PSession(sessionId, hostUserId, guestUserId, mcPort) {
        const res = await this.query(
            `INSERT INTO p2p_sessions (session_id, host_user_id, guest_user_id, mc_port, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             RETURNING *`,
            [sessionId, hostUserId, guestUserId, mcPort || 25565]
        );
        return res.rows[0];
    }

    async getP2PSession(sessionId) {
        const res = await this.query(
            `SELECT * FROM p2p_sessions WHERE session_id = $1`,
            [sessionId]
        );
        return res.rows[0] || null;
    }

    async updateP2PStatus(sessionId, status) {
        await this.query(
            `UPDATE p2p_sessions SET status = $2, updated_at = NOW() WHERE session_id = $1`,
            [sessionId, status]
        );
    }

    async updateP2POffer(sessionId, offerSdp) {
        await this.query(
            `UPDATE p2p_sessions SET offer_sdp = $2, status = 'OFFERED', updated_at = NOW() WHERE session_id = $1`,
            [sessionId, offerSdp]
        );
    }

    async updateP2PAnswer(sessionId, answerSdp) {
        await this.query(
            `UPDATE p2p_sessions SET answer_sdp = $2, status = 'ANSWERED', updated_at = NOW() WHERE session_id = $1`,
            [sessionId, answerSdp]
        );
    }

    async addP2PHostIce(sessionId, candidate) {
        await this.query(
            `UPDATE p2p_sessions SET host_ice = host_ice || $2::jsonb, updated_at = NOW() WHERE session_id = $1`,
            [sessionId, JSON.stringify([candidate])]
        );
    }

    async addP2PGuestIce(sessionId, candidate) {
        await this.query(
            `UPDATE p2p_sessions SET guest_ice = guest_ice || $2::jsonb, updated_at = NOW() WHERE session_id = $1`,
            [sessionId, JSON.stringify([candidate])]
        );
    }

    async getP2PHostIce(sessionId) {
        const res = await this.query(
            `SELECT host_ice FROM p2p_sessions WHERE session_id = $1`,
            [sessionId]
        );
        return res.rows[0]?.host_ice || [];
    }

    async getP2PGuestIce(sessionId) {
        const res = await this.query(
            `SELECT guest_ice FROM p2p_sessions WHERE session_id = $1`,
            [sessionId]
        );
        return res.rows[0]?.guest_ice || [];
    }

    async closeP2PSession(sessionId) {
        await this.query(
            `UPDATE p2p_sessions SET status = 'CLOSED', updated_at = NOW() WHERE session_id = $1`,
            [sessionId]
        );
    }

    // ── Game Invites ──
    async sendGameInvite(fromUserId, toUsername, worldName, serverIp, p2pSessionId) {
        const toUser = await this.getUserByUsername(toUsername);
        if (!toUser) return null;
        const res = await this.query(
            `INSERT INTO game_invitations (from_user_id, to_user_id, world_name, server_ip, p2p_session_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, created_at`,
            [fromUserId, toUser.id, worldName || 'su mundo', serverIp || null, p2pSessionId || null]
        );
        return res.rows[0];
    }

    async getPendingGameInvites(userId) {
        const res = await this.query(
            `SELECT gi.id, gi.world_name, gi.server_ip, gi.p2p_session_id, gi.created_at, u.username AS from_username
             FROM game_invitations gi
             JOIN users u ON u.id = gi.from_user_id
             WHERE gi.to_user_id = $1 AND gi.status = 'pending'
             ORDER BY gi.created_at DESC`,
            [userId]
        );
        return res.rows;
    }

    async acceptGameInvite(inviteId) {
        const res = await this.query(
            `UPDATE game_invitations SET status = 'accepted', updated_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, p2p_session_id, server_ip`,
            [inviteId]
        );
        return res.rows[0] || null;
    }

    async rejectGameInvite(inviteId) {
        const res = await this.query(
            `UPDATE game_invitations SET status = 'rejected', updated_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING id`,
            [inviteId]
        );
        return res.rows.length > 0;
    }

    // ── Cleanup ──
    async deleteExpiredGuests() {
        const res = await this.query(
            `DELETE FROM users WHERE is_guest = TRUE AND guest_expires_at < NOW()
             RETURNING id, username`
        );
        return res.rows;
    }
}

module.exports = SocialDB;
