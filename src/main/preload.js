const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (partial) => ipcRenderer.invoke('config:save', partial),
  checkCloudflared: () => ipcRenderer.invoke('cloudflared:check'),
  installCloudflared: () => ipcRenderer.invoke('cloudflared:install'),
  startTunnel: (config) => ipcRenderer.invoke('tunnel:start', config),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  pickCloudflaredPath: () => ipcRenderer.invoke('dialog:pick-cloudflared'),
  pickLogFile: () => ipcRenderer.invoke('dialog:pick-logfile'),
  openLog: () => ipcRenderer.invoke('log:open'),
  openLogDir: () => ipcRenderer.invoke('log:open-dir'),
  onLog: (callback) => ipcRenderer.on('tunnel:log', (_event, line) => callback(line)),
  onStatus: (callback) => ipcRenderer.on('tunnel:status', (_event, status) => callback(status)),
  onInstallLog: (callback) => ipcRenderer.on('cloudflared:install-log', (_event, message) => callback(message))
});