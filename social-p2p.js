const SimplePeer = require('simple-peer');

class SocialP2P {
    constructor() {
        this.peer = null;
        this.activeCall = null;
        this.onSignal = null;
        this.onConnect = null;
        this.onData = null;
        this.onClose = null;
        this.onError = null;
    }

    startCall(initiator, signalCallback) {
        if (this.peer) this.endCall();

        this.onSignal = signalCallback;
        this.peer = new SimplePeer({ initiator, trickle: false });

        this.peer.on('signal', (data) => {
            if (this.onSignal) this.onSignal(data);
        });

        this.peer.on('connect', () => {
            this.activeCall = true;
            if (this.onConnect) this.onConnect();
        });

        this.peer.on('data', (data) => {
            if (this.onData) this.onData(data.toString());
        });

        this.peer.on('close', () => {
            this.activeCall = false;
            if (this.onClose) this.onClose();
        });

        this.peer.on('error', (e) => {
            console.error('[P2P] Error:', e.message);
            if (this.onError) this.onError(e);
        });
    }

    signal(data) {
        if (this.peer) {
            this.peer.signal(data);
        }
    }

    send(data) {
        if (this.peer && this.activeCall) {
            this.peer.send(data);
        }
    }

    endCall() {
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
        }
        this.activeCall = false;
    }

    isActive() {
        return this.activeCall && this.peer !== null;
    }
}

module.exports = SocialP2P;
