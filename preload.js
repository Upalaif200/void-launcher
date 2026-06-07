const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (ch, data) => ipcRenderer.invoke(ch, data),
    on: (ch, fn) => ipcRenderer.on(ch, (_, ...args) => fn(...args)),
    removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch)
});
