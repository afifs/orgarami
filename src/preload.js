const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File ops
  openFile:          ()                  => ipcRenderer.invoke('dialog:open-file'),
  fetchRemoteUrl:    (url)               => ipcRenderer.invoke('fetch:remote-url', url),
  getLastSource:     ()                  => ipcRenderer.invoke('settings:get-last-source'),
  reloadFile:        (filePath)          => ipcRenderer.invoke('file:reload', filePath),
  saveFile:          (csv)               => ipcRenderer.invoke('dialog:save-file', csv),
  saveFileOverwrite: (filePath, csv)     => ipcRenderer.invoke('file:save-overwrite', filePath, csv),
  // Print
  printChart:        (svgHtml)           => ipcRenderer.invoke('window:print', svgHtml),
  // Visual config
  loadConfig:        ()                  => ipcRenderer.invoke('config:load'),
  saveConfig:        (data)              => ipcRenderer.invoke('config:save', data),
  resetConfig:       ()                  => ipcRenderer.invoke('config:reset'),
  getConfigDefaults: ()                  => ipcRenderer.invoke('config:defaults'),
  // i18n
  detectLanguage:         ()                  => ipcRenderer.invoke('i18n:detect-language'),
  setLanguage:       (lang)              => ipcRenderer.invoke('i18n:set-language', lang),
  getSupportedLangs: ()                  => ipcRenderer.invoke('i18n:supported-langs'),
  // Menu events
  onMenuOpenFile:    (cb)                => ipcRenderer.on('menu:open-file', cb),
  onMenuOpenUrl:     (cb)                => ipcRenderer.on('menu:open-url', cb),
  onMenuPrint:       (cb)                => ipcRenderer.on('menu:print', cb),
  onMenuSettings:    (cb)                => ipcRenderer.on('menu:settings', cb),
});
