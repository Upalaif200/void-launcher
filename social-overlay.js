const { ipcRenderer } = require('electron');

process.on('unhandledRejection', (reason) => {
    console.error('[OVERLAY] Unhandled rejection:', reason);
});

ipcRenderer.on('admin-toast', (_, data) => {
    const type = data.type === 'error' ? 'error' : data.type === 'success' ? 'success' : '';
    showToast(data.msg, type);
});

let activeChatUser = null;
let chatPollInterval = null;
let seenInviteIds = new Set();

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = type || '';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function closeOverlay() {
    closeChat();
    ipcRenderer.send('close-overlay');
}

function openFullSocial() {
    ipcRenderer.send('focus-main-window');
    ipcRenderer.send('overlay-open-chat', '__navigate_social__');
    closeOverlay();
}

function openChat(username) {
    const panel = document.getElementById('chat-panel');
    document.getElementById('chat-name').textContent = username;
    document.getElementById('chat-messages').innerHTML = '<div class="empty-state">Cargando...</div>';
    document.getElementById('chat-state').textContent = '';
    document.getElementById('chat-status-dot').className = 'chat-status-dot';
    panel.classList.add('open');
    activeChatUser = username;
    loadChatMessages(username);
    updateChatStatus();
    document.getElementById('friend-list').style.display = 'none';
    document.getElementById('add-friend').style.display = 'none';
    setTimeout(() => document.getElementById('chat-input').focus(), 100);
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(() => loadChatMessages(username), 3000);
}

async function updateChatStatus() {
    if (!activeChatUser) return;
    const state = await ipcRenderer.invoke('get-social-state');
    if (!state) return;
    const friend = state.friends.find(f => f.username === activeChatUser);
    const online = friend && friend.status !== 'offline';
    document.getElementById('chat-status-dot').className = 'chat-status-dot' + (online ? ' online' : '');
    document.getElementById('chat-state').textContent = friend ? getStatusLabel(friend.status, friend.version) : '';
}

function closeChat() {
    activeChatUser = null;
    if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
    document.getElementById('chat-panel').classList.remove('open');
    document.getElementById('friend-list').style.display = '';
    document.getElementById('add-friend').style.display = '';
}

let chatMsgCount = 0;

function buildMsgEl(msg, myName) {
    const isMine = msg.from_user === myName;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const d = document.createElement('div');
    d.style.cssText = 'max-width:85%;padding:6px 10px;border-radius:8px;font-size:12px;line-height:1.4;word-break:break-word;align-self:' + (isMine ? 'flex-end' : 'flex-start') + ';background:' + (isMine ? 'rgba(110,60,220,0.25)' : 'rgba(20,20,20,0.6)') + ';border:1px solid ' + (isMine ? 'rgba(130,80,240,0.2)' : 'rgba(255,255,255,0.08)') + ';color:' + (isMine ? '#d0b8ff' : '#ccc');
    d.innerHTML = escHtml(msg.content) + '<div style="font-size:9px;color:#666;margin-top:2px;">' + (isMine ? 'Tú' : escHtml(msg.from_user)) + ' · ' + time + '</div>';
    return d;
}

async function loadChatMessages(username) {
    const container = document.getElementById('chat-messages');
    if (!username || !container) return;
    try {
        const msgs = await ipcRenderer.invoke('social-get-messages', { withUser: username });
        if (!msgs || !msgs.length) {
            if (chatMsgCount !== 0) {
                container.innerHTML = '<div class="empty-state">Inicia la conversación con ' + escHtml(username) + '</div>';
                chatMsgCount = 0;
            }
            return;
        }
        if (msgs.length === chatMsgCount) return;
        const state = await ipcRenderer.invoke('get-social-state');
        const myName = state?.myUsername || '';
        container.innerHTML = '';
        msgs.forEach(msg => container.appendChild(buildMsgEl(msg, myName)));
        container.scrollTop = container.scrollHeight;
        chatMsgCount = msgs.length;
    } catch (e) {
        console.error('[OVERLAY] loadChatMessages error:', e);
    }
}

function sendChatMessage() {
    if (!activeChatUser) return;
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    ipcRenderer.invoke('social-send-message', { toUser: activeChatUser, content: text }).then(() => {
        input.value = '';
        loadChatMessages(activeChatUser);
    }).catch(e => console.error('[OVERLAY] send message error:', e));
}

document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

function inviteToGame(username) {
    ipcRenderer.invoke('send-game-invite', { toUser: username }).then(r => {
        if (r.success) showToast('Invitación enviada a ' + username, 'success');
        else showToast(r.error || 'Error al invitar', 'error');
    }).catch(() => showToast('Error al invitar', 'error'));
}

function removeFriend(username) {
    ipcRenderer.invoke('social-remove-friend', { friendUser: username }).then(() => {
        showToast(username + ' eliminado de amigos', 'success');
        loadSocialState();
    }).catch(() => showToast('Error al eliminar amigo', 'error'));
}

function acceptFriendRequest(username) {
    ipcRenderer.invoke('social-accept-friend', { fromUser: username }).then(() => {
        showToast('Solicitud de ' + username + ' aceptada', 'success');
        loadSocialState();
    }).catch(() => {});
}

function rejectFriendRequest(username) {
    ipcRenderer.invoke('social-reject-friend', { fromUser: username }).then(() => {
        loadSocialState();
    }).catch(() => {});
}

function switchTab(tabId) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
    if (tabId === 'tab-requests') loadSocialState();
}

function getStatusLabel(status, version) {
    if (status === 'playing_singleplayer') return version ? version + ' - Singleplayer' : 'Singleplayer';
    if (status === 'playing_multiplayer') return version ? version + ' - Multiplayer' : 'Multiplayer';
    if (status === 'menu') return version ? version + ' - Menú' : 'Menú';
    switch (status) {
        case 'online': return 'Conectado';
        case 'away': return 'Ausente';
        case 'dnd': return 'No molestar';
        case 'offline': return 'Desconectado';
        default: return status || 'Desconocido';
    }
}

function getStatusDotClass(status) {
    if (status === 'offline') return 'offline';
    if (status === 'playing_singleplayer' || status === 'playing_multiplayer' || status === 'menu') return 'playing_singleplayer';
    if (status === 'away') return 'away';
    if (status === 'dnd') return 'dnd';
    return 'online';
}

function renderFriends(friends) {
    const list = document.getElementById('friend-list');
    if (!friends || !friends.length) {
        list.innerHTML = '<div class="empty-state">No tienes amigos.</div>';
        return;
    }
    const sorted = [...friends].sort((a, b) => {
        const order = { 'offline': 1, 'away': 0, 'dnd': 0, 'online': -1, 'menu': -2, 'playing_singleplayer': -2, 'playing_multiplayer': -2 };
        return (order[a.status] || 0) - (order[b.status] || 0);
    });
    list.innerHTML = sorted.map(f => {
        const label = getStatusLabel(f.status, f.version);
        const dotClass = getStatusDotClass(f.status);
        return '<div class="friend-item">'
            + '<div class="avatar"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>'
            + '<div class="info">'
            + '<div class="name">' + escHtml(f.username) + ' <span class="status-dot ' + dotClass + '"></span></div>'
            + '<div class="status">' + escHtml(label) + '</div>'
            + '</div>'
            + '<div class="actions">'
            + '<button onclick="openChat(\'' + escAttr(f.username) + '\')" title="Chat">💬</button>'
            + '<button class="invite-btn" onclick="inviteToGame(\'' + escAttr(f.username) + '\')" title="Invitar a jugar">+</button>'
            + '<button class="remove-btn" onclick="removeFriend(\'' + escAttr(f.username) + '\')" title="Eliminar amigo">−</button>'
            + '</div>'
            + '</div>';
    }).join('');
}

function renderRequests(requests) {
    const list = document.getElementById('requests-list');
    const badge = document.getElementById('requests-badge');
    const count = requests ? requests.length : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
    if (!count) {
        list.innerHTML = '<div class="empty-state">Sin solicitudes.</div>';
        return;
    }
    list.innerHTML = requests.map(r =>
        '<div class="friend-item">'
        + '<div class="avatar"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>'
        + '<div class="info">'
        + '<div class="name">' + escHtml(r.from) + '</div>'
        + '<div class="status" style="font-size:9px;">Quiere ser tu amigo</div>'
        + '</div>'
        + '<div class="actions">'
        + '<button class="accept-btn" onclick="acceptFriendRequest(\'' + escAttr(r.from) + '\')" title="Aceptar">✓</button>'
        + '<button class="remove-btn" onclick="rejectFriendRequest(\'' + escAttr(r.from) + '\')" title="Rechazar">✕</button>'
        + '</div>'
        + '</div>'
    ).join('');
}

function updateBridgeStatus(connected) {
    const dot = document.getElementById('bridge-dot');
    const text = document.getElementById('bridge-text');
    if (dot && text) {
        dot.className = 'dot' + (connected ? ' online' : '');
        text.textContent = connected ? 'Neon: Conectado' : 'Neon: Desconectado';
    }
}

function sendFriendRequest() {
    const input = document.getElementById('friend-search-input');
    const username = input.value.trim();
    if (!username) return;
    ipcRenderer.invoke('social-send-friend-request', { toUser: username }).then(r => {
        if (r.success) {
            showToast('Solicitud enviada a ' + username, 'success');
            input.value = '';
            input.blur();
            document.getElementById('search-results').style.display = 'none';
        } else {
            showToast(r.error || 'Error', 'error');
        }
    }).catch(() => showToast('Error al enviar solicitud', 'error'));
}

function renderGameInvites(invites) {
    const list = document.getElementById('invites-list');
    const badge = document.getElementById('invites-badge');
    const count = invites ? invites.length : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
    if (!count) {
        list.innerHTML = '<div class="empty-state">Sin invitaciones.</div>';
        return;
    }
    list.innerHTML = invites.map(inv =>
        '<div class="friend-item">'
        + '<div class="avatar"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></div>'
        + '<div class="info">'
        + '<div class="name">' + escHtml(inv.from) + '</div>'
        + '<div class="status" style="font-size:9px;">Te invitó a ' + escHtml(inv.worldName || 'jugar') + '</div>'
        + '</div>'
        + '<div class="actions">'
        + '<button class="accept-btn" onclick="acceptGameInvite(\'' + inv.id + '\')" title="Aceptar">✓</button>'
        + '<button class="remove-btn" onclick="rejectGameInvite(\'' + inv.id + '\')" title="Rechazar">✕</button>'
        + '</div>'
        + '</div>'
    ).join('');
}

function acceptGameInvite(inviteId) {
    ipcRenderer.invoke('social-accept-game-invite', { inviteId }).then(r => {
        if (r.success) {
            showToast('Invitación aceptada', 'success');
            loadSocialState();
        } else {
            showToast(r.error || 'Error al aceptar', 'error');
        }
    }).catch(() => showToast('Error al aceptar', 'error'));
}

function rejectGameInvite(inviteId) {
    ipcRenderer.invoke('social-reject-game-invite', { inviteId }).then(r => {
        if (r.success) {
            showToast('Invitación rechazada', 'success');
            loadSocialState();
        } else {
            showToast(r.error || 'Error al rechazar', 'error');
        }
    }).catch(() => showToast('Error al rechazar', 'error'));
}

function sendFriendRequestTo(username) {
    ipcRenderer.invoke('social-send-friend-request', { toUser: username }).then(r => {
        if (r.success) showToast('Solicitud enviada a ' + username, 'success');
        else showToast(r.error || 'Error', 'error');
    }).catch(() => {});
    document.getElementById('friend-search-input').value = '';
    document.getElementById('search-results').style.display = 'none';
}

async function loadSocialState() {
    const state = await ipcRenderer.invoke('get-social-state');
    if (state) {
        updateBridgeStatus(state.connected);
        renderFriends(state.friends);
        renderRequests(state.pending);
        renderGameInvites(state.gameInvites || []);
        for (const inv of (state.gameInvites || [])) {
            if (!seenInviteIds.has(inv.id)) {
                seenInviteIds.add(inv.id);
                showToast('Invitación de ' + inv.from, '');
            }
        }
        if (activeChatUser) {
            const friend = state.friends.find(f => f.username === activeChatUser);
            const online = friend && friend.status !== 'offline';
            document.getElementById('chat-status-dot').className = 'chat-status-dot' + (online ? ' online' : '');
            document.getElementById('chat-state').textContent = friend ? getStatusLabel(friend.status, friend.version) : '';
        }
    } else {
        document.getElementById('friend-list').innerHTML =
            '<div class="empty-state">No has iniciado sesión</div>';
    }
}

loadSocialState().catch(e => console.error('[OVERLAY] loadSocialState error:', e));

const searchInput = document.getElementById('friend-search-input');
const searchResults = document.getElementById('search-results');
let searchDebounce = null;
if (searchInput && searchResults) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendFriendRequest();
    });
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const val = searchInput.value.trim();
        if (val.length < 1) { searchResults.innerHTML = ''; searchResults.style.display = 'none'; return; }
        searchDebounce = setTimeout(async () => {
            const users = await ipcRenderer.invoke('social-search-users', { query: val });
            if (!users.length) { searchResults.innerHTML = ''; searchResults.style.display = 'none'; return; }
            searchResults.innerHTML = users.map(u =>
                '<div class="suggestion" data-username="' + escAttr(u.username) + '">' + escHtml(u.username) + '</div>'
            ).join('');
            searchResults.style.display = 'block';
        }, 200);
    });
    searchInput.addEventListener('blur', () => {
        setTimeout(() => { searchResults.innerHTML = ''; searchResults.style.display = 'none'; }, 150);
    });
    searchResults.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion');
        if (item) sendFriendRequestTo(item.dataset.username);
    });
}

setInterval(loadSocialState, 10000);
