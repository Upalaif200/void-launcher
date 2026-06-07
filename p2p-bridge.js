const net = require('net');
const EventEmitter = require('events');

class P2PBridge extends EventEmitter {
    constructor() {
        super();
        this.server = null;
        this.sockets = new Set();
        this._txBytes = 0;
        this._rxBytes = 0;
        this._logInterval = null;
        this._dcMessageBound = false;
    }

    _bindDcHandler(dataChannel) {
        if (this._dcMessageBound) return;
        this._dcMessageBound = true;
        dataChannel.onMessage((msg) => {
            const buf = typeof msg === 'string' ? Buffer.from(msg) : msg;
            this._txBytes += buf.length;
            for (const socket of this.sockets) {
                if (!socket.destroyed) {
                    socket.write(buf);
                    break;
                }
            }
        });
    }

    startHostBridge(dataChannel, localPort) {
        this.dc = dataChannel;
        this._bindDcHandler(dataChannel);

        this.server = net.createServer((socket) => {
            this.sockets.add(socket);

            socket.on('data', (chunk) => {
                this._rxBytes += chunk.length;
                if (dataChannel.isOpen()) {
                    dataChannel.sendMessageBinary(chunk);
                }
            });

            socket.on('close', () => {
                this.sockets.delete(socket);
            });

            socket.on('error', () => {});
        });

        return new Promise((resolve) => {
            this.server.listen(localPort, '127.0.0.1', () => {
                console.log(`[BRIDGE] Host bridge on 127.0.0.1:${localPort}`);
                this._startLogging();
                resolve();
            });
        });
    }

    startGuestBridge(dataChannel, proxyPort) {
        this.dc = dataChannel;
        this._bindDcHandler(dataChannel);

        this.server = net.createServer((socket) => {
            this.sockets.add(socket);

            socket.on('data', (chunk) => {
                this._rxBytes += chunk.length;
                if (dataChannel.isOpen()) {
                    dataChannel.sendMessageBinary(chunk);
                }
            });

            socket.on('close', () => {
                this.sockets.delete(socket);
            });

            socket.on('error', () => {});
        });

        return new Promise((resolve) => {
            this.server.listen(proxyPort, '127.0.0.1', () => {
                console.log(`[BRIDGE] Guest bridge on 127.0.0.1:${proxyPort}`);
                this._startLogging();
                resolve();
            });
        });
    }

    _startLogging() {
        this._logInterval = setInterval(() => {
            const up = (this._txBytes / 1024).toFixed(1);
            const down = (this._rxBytes / 1024).toFixed(1);
            console.log(`[BRIDGE] ↑ ${up}KB/s ↓ ${down}KB/s`);
            this._txBytes = 0;
            this._rxBytes = 0;
        }, 10000);
    }

    stop() {
        if (this._logInterval) {
            clearInterval(this._logInterval);
            this._logInterval = null;
        }
        try { this.dc?.close(); } catch (_) {}
        for (const socket of this.sockets) {
            try { socket.destroy(); } catch (_) {}
        }
        this.sockets.clear();
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.emit('bridge-disconnected');
    }
}

module.exports = P2PBridge;
