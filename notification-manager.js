const { Notification } = require('electron');
const path = require('path');

class NotificationManager {
    constructor(iconPath) {
        this.iconPath = iconPath || path.join(__dirname, 'build', 'icon.png');
        this.onNotificationClick = null;
    }

    show(type, data) {
        let title, body, onClickAction;

        switch (type) {
            case 'message:new':
                title = data.fromUsername || data.from;
                body = data.text;
                onClickAction = { action: 'open-chat', uuid: data.from };
                break;

            case 'friend:online':
                title = 'Void Social';
                body = `${data.username} está en línea`;
                onClickAction = { action: 'open-social' };
                break;

            case 'friend:in-game':
                title = 'Void Social';
                body = `${data.username} está jugando Minecraft`;
                onClickAction = { action: 'open-social' };
                break;

            case 'friend:request':
                title = 'Solicitud de amistad';
                body = `${data.username} quiere ser tu amigo`;
                onClickAction = { action: 'open-social', tab: 'friends' };
                break;

            case 'invitation:new':
                title = 'Invitación a mundo';
                body = `${data.fromUsername} te invitó a ${data.worldName}`;
                onClickAction = { action: 'open-social', tab: 'invitations' };
                break;

            case 'invitation:accepted':
                title = 'Invitación aceptada';
                body = `${data.fromUsername} aceptó tu invitación a ${data.worldName}`;
                onClickAction = { action: 'open-social' };
                break;

            default:
                title = 'Void Social';
                body = data.body || data.text || '';
                onClickAction = { action: 'open-social' };
        }

        try {
            const notif = new Notification({
                title: title.substring(0, 64),
                body: body.substring(0, 192),
                icon: this.iconPath
            });

            const action = onClickAction;
            notif.on('click', () => {
                if (this.onNotificationClick) {
                    this.onNotificationClick(action);
                }
            });

            notif.show();
            return notif;
        } catch (e) {
            console.error('[Notifications] Error:', e.message);
        }
    }
}

module.exports = NotificationManager;
