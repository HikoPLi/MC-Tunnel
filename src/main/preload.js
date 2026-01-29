const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (partial) => ipcRenderer.invoke('config:save', partial),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  checkCloudflared: (cloudflaredPath) => ipcRenderer.invoke('cloudflared:check', cloudflaredPath),
  installCloudflared: (options) => ipcRenderer.invoke('cloudflared:install', options),
  startTunnel: (config) => ipcRenderer.invoke('tunnel:start', config),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  checkPort: (localBind) => ipcRenderer.invoke('port:check', localBind),
  pickCloudflaredPath: () => ipcRenderer.invoke('dialog:pick-cloudflared'),
  pickLogFile: (suggestedPath) => ipcRenderer.invoke('dialog:pick-logfile', suggestedPath),
  openLog: (logFile) => ipcRenderer.invoke('log:open', logFile),
  openLogDir: (logFile) => ipcRenderer.invoke('log:open-dir', logFile),
  getDefaultLogFile: () => ipcRenderer.invoke('log:default-path'),
  openConfigDir: () => ipcRenderer.invoke('config:open-dir'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  onLog: (callback) => ipcRenderer.on('tunnel:log', (_event, line) => callback(line)),
  onStatus: (callback) => ipcRenderer.on('tunnel:status', (_event, status) => callback(status)),
  onInstallLog: (callback) => ipcRenderer.on('cloudflared:install-log', (_event, message) => callback(message)),
  onAuthUrl: (callback) => ipcRenderer.on('tunnel:auth-url', (_event, payload) => callback(payload))
});
