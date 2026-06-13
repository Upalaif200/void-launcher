const SocialDB = require('./social-db');
const crypto = require('crypto');

class SocialManager {
    constructor() {
        this.db = new SocialDB();
        this.activeSession = null;
        this.activeUserId = null;
        this.launcherId = crypto.randomBytes(8).toString('hex');
        this.heartbeatInterval = null;
        this.pollInterval = null;
        this.onEvent = null;
    }

    init(connectionString) {
        const result = this.db.connect(connectionString);
        return result;
    }

    async startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(async () => {
            if (this.activeSession) {
                try {
                    await this.db.heartbeat(this.activeSession.token);
                    await this.db.updateStatus(this.activeUserId, 'online', '');
                } catch (e) {
                    console.error('[Social] Heartbeat error:', e.message);
                }
            }
        }, 30000);
    }

    startPolling(callback) {
        this.onEvent = callback;
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(async () => {
            if (!this.activeUserId) return;
            try {
                const requests = await this.db.getPendingRequests(this.activeUserId);
                if (requests.length > 0) {
                    callback({ type: 'pending-requests', data: requests });
                }
                const invites = await this.db.getPendingGameInvites(this.activeUserId);
                if (invites.length > 0) {
                    callback({ type: 'game-invites', data: invites });
                }
            } catch (e) { /* ignore polling errors */ }
        }, 5000);
    }

    stop() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.heartbeatInterval = null;
        this.pollInterval = null;
        this.activeSession = null;
        this.activeUserId = null;
    }

    pausePolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    resumePolling() {
        if (!this.pollInterval && this.activeUserId) {
            this.startPolling(this.onEvent);
        }
    }

    pauseHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    resumeHeartbeat() {
        if (!this.heartbeatInterval && this.activeSession) {
            this.startHeartbeat();
        }
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    generateUsername() {
        return 'Jugador' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    // ── Auth ──
    async signup(username, password) {
        const existing = await this.db.getUserByUsername(username);
        if (existing) return { success: false, error: 'El nombre de usuario ya existe' };
        if (username.length < 3) return { success: false, error: 'Mínimo 3 caracteres' };
        if (password.length < 4) return { success: false, error: 'Contraseña muy corta' };

        const user = await this.db.createUser(username, this.hashPassword(password));
        await this.db.updateStatus(user.id, 'online', '');
        const session = await this.db.createSession(user.id, this.launcherId);
        this.activeSession = session;
        this.activeUserId = user.id;
        return { success: true, user, session };
    }

    async signin(username, password) {
        const user = await this.db.getUserByUsername(username);
        if (!user) return { success: false, error: 'Usuario no encontrado' };
        if (!user.is_guest && user.password_hash !== this.hashPassword(password)) {
            return { success: false, error: 'Contraseña incorrecta' };
        }
        if (user.is_guest) return { success: false, error: 'Esta es una cuenta invitado' };

        await this.db.updateStatus(user.id, 'online', '');
        const session = await this.db.createSession(user.id, this.launcherId);
        this.activeSession = session;
        this.activeUserId = user.id;
        return { success: true, user, session };
    }

    async createGuest() {
        let username;
        for (let i = 0; i < 10; i++) {
            username = this.generateUsername();
            const existing = await this.db.getUserByUsername(username);
            if (!existing) break;
        }
        const user = await this.db.createGuestUser(username);
        await this.db.updateStatus(user.id, 'online', '');
        const session = await this.db.createSession(user.id, this.launcherId);
        this.activeSession = session;
        this.activeUserId = user.id;
        return { success: true, user, session };
    }

    async signout() {
        if (this.activeSession) {
            await this.db.deleteSession(this.activeSession.token);
        }
        if (this.activeUserId) {
            await this.db.updateStatus(this.activeUserId, 'offline', '');
        }
        this.activeSession = null;
        this.activeUserId = null;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.heartbeatInterval = null;
        this.pollInterval = null;
        return { success: true };
    }

    async deleteAccount() {
        if (!this.activeUserId) return { success: false, error: 'No hay sesión' };
        await this.db.deleteUser(this.activeUserId);
        this.activeSession = null;
        this.activeUserId = null;
        return { success: true };
    }

    isLoggedIn() {
        return this.activeUserId !== null && this.activeSession !== null;
    }

    getUserId() { return this.activeUserId; }

    async getProfile() {
        if (!this.activeUserId) return null;
        return await this.db.getUserById(this.activeUserId);
    }

    // ── Friends ──
    async sendFriendRequest(username) {
        if (!this.activeUserId) return { success: false, error: 'No hay sesión' };
        const target = await this.db.getUserByUsername(username);
        if (!target) return { success: false, error: 'Usuario no encontrado' };
        if (target.id === this.activeUserId) return { success: false, error: 'No puedes enviarte solicitud a ti mismo' };
        const friends = await this.listFriends();
        if (friends.some(f => f.username === username)) {
            return { success: false, error: 'Ya está en tus amigos' };
        }
        try {
            await this.db.sendFriendRequest(this.activeUserId, target.id);
            return { success: true };
        } catch (e) {
            return { success: false, error: 'Solicitud ya enviada' };
        }
    }

    async acceptFriendRequest(requestId) {
        const result = await this.db.acceptFriendRequest(requestId);
        return result ? { success: true } : { success: false, error: 'No encontrada' };
    }

    async rejectFriendRequest(requestId) {
        const result = await this.db.rejectFriendRequest(requestId);
        return result ? { success: true } : { success: false, error: 'No encontrada' };
    }

    async removeFriend(friendId) {
        if (!this.activeUserId) return { success: false, error: 'No hay sesión' };
        await this.db.removeFriend(this.activeUserId, friendId);
        return { success: true };
    }

    async listFriends() {
        if (!this.activeUserId) return [];
        return await this.db.listFriends(this.activeUserId);
    }

    async getPendingRequests() {
        if (!this.activeUserId) return [];
        return await this.db.getPendingRequests(this.activeUserId);
    }

    async getUserByUsername(username) {
        const user = await this.db.getUserByUsername(username);
        if (!user) return null;
        const { password_hash, ...safe } = user;
        return safe;
    }

    // ── Chat ──
    async getOrCreateConversation(friendId) {
        if (!this.activeUserId) return null;
        return await this.db.getOrCreateDuoConversation(this.activeUserId, friendId);
    }

    async sendMessage(conversationId, content) {
        if (!this.activeUserId) return null;
        return await this.db.sendMessage(conversationId, this.activeUserId, content);
    }

    async getMessages(conversationId, beforeId) {
        return await this.db.getMessages(conversationId, 50, beforeId);
    }

    async getConversations() {
        if (!this.activeUserId) return [];
        return await this.db.getConversations(this.activeUserId);
    }

    async markRead(conversationId) {
        if (!this.activeUserId) return;
        await this.db.markMessagesRead(conversationId, this.activeUserId, null);
    }

    // ── P2P ──
    async createP2POffer(calleeId, signalData) {
        if (!this.activeUserId) return null;
        return await this.db.createP2PSession(this.activeUserId, calleeId, signalData);
    }

    async relayP2PAnswer(sessionId, signalData) {
        await this.db.updateP2PSession(sessionId, signalData);
    }

    async endP2PSession(sessionId) {
        await this.db.endP2PSession(sessionId);
    }

    async getActiveP2PSession() {
        if (!this.activeUserId) return null;
        return await this.db.getActiveP2PSession(this.activeUserId);
    }

    // ── Game Invites ──
    async sendGameInvite(toUsername, worldName, serverIp, p2pSessionId) {
        if (!this.activeUserId) return { success: false, error: 'No hay sesión' };
        const result = await this.db.sendGameInvite(this.activeUserId, toUsername, worldName, serverIp, p2pSessionId);
        return result ? { success: true } : { success: false, error: 'No se pudo enviar' };
    }

    async getPendingGameInvites() {
        if (!this.activeUserId) return [];
        return await this.db.getPendingGameInvites(this.activeUserId);
    }

    async acceptGameInvite(inviteId) {
        return await this.db.acceptGameInvite(inviteId);
    }

    async rejectGameInvite(inviteId) {
        return await this.db.rejectGameInvite(inviteId);
    }

    async getFriendStatus(friendId) {
        if (!this.activeUserId) return null;
        return await this.db.getFriendStatus(this.activeUserId, friendId);
    }
}

module.exports = SocialManager;
