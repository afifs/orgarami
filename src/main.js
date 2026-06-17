const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');
const isDev = !app.isPackaged
// ── Persistent settings ────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const assetsPath = isDev
    ? path.join(__dirname, '..', 'assets')
    : path.join(process.resourcesPath, 'assets')

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath))
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (_) {}
  return {};
}
function saveSettings(data) {
  try { fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8'); }
  catch (_) {}
}


// ── Visual config ──────────────────────────────────────────────────────────
const configPath = path.join(app.getPath('userData'), 'visualconfig.json');

const CONFIG_DEFAULTS = {
  nodeWidth:        210,
  nodeHeight:        84,
  rootNodeHeight:    60,
  colorBarHeight:    10,
  borderColor:    '#dddddd',
  borderRadius:       5,
  cardBackground: '#ffffff',
  nameTagBackground: '#e8e8e8',
  nameTagBorder:  '#bbbbbb',
  positionFontSize:  13,
  positionFontWeight:'600',
  nameFontSize:      11,
  showPersonNames:  true,
  childrenMargin:    44,
  compactMarginBetween: 15,
  compactMarginPair:    80,
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Object.assign({}, CONFIG_DEFAULTS, saved);
    }
  } catch (_) {}
  return Object.assign({}, CONFIG_DEFAULTS);
}
function saveConfig(data) {
  try { fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8'); }
  catch (_) {}
}

// ── Main window ────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 800, minHeight: 600,
    title: 'Orgarami',
    icon: path.join(assetsPath, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const lang = detectLanguage();
  const strings = loadLocale(lang);
  buildMenu(strings); // Initialize menu with correct language

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// ── About window ───────────────────────────────────────────────────────────
let aboutWindow = null;

function openAboutWindow() {
  if (aboutWindow) { aboutWindow.focus(); return; }
  const lang = detectLanguage();
  aboutWindow = new BrowserWindow({
    width: 480, height: 540,
    title: 'About Orgarami',
    icon: path.join(__dirname, 'icon.ico'),
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  aboutWindow.setMenu(null);
  // Pass lang as query param so about.html can load the right locale
  aboutWindow.loadFile(path.join(__dirname, 'about.html'), { query: { lang } });
  aboutWindow.on('closed', () => { aboutWindow = null; });
}

// ── App menu ───────────────────────────────────────────────────────────────
function buildMenu(t) {
  const template = [
    {
      label: t.menu.file || 'File', // Use keys from your JSON locale files
      submenu: [
        { label: t.menu.openFile || 'Open CSV file…', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu:open-file') },
        { label: t.menu.loadUrl || 'Load from URL…', accelerator: 'CmdOrCtrl+U', click: () => mainWindow.webContents.send('menu:open-url') },
        { type: 'separator' },
        { label: t.menu.print || 'Print…', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.send('menu:print') },
        { label: t.menu.settings || 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.send('menu:settings') },
        { type: 'separator' },
        { label: t.menu.quit || 'Exit…', accelerator: 'CmdOrCtrl+Q' , role: 'quit' }
      ]
    },
    {
      label: t.menu.view || 'View',
      submenu: [
        { label: t.menu.reload || 'Reload…', accelerator: 'CmdOrCtrl+R' , role: 'reload' },
        { label: t.menu.devTools || 'Dev Tools…', accelerator: 'CmdOrCtrl+D' , role: 'toggleDevTools' },
        { type: 'separator' },
        { label: t.menu.fullscreen || 'Full Screen…', accelerator: 'CmdOrCtrl+F' ,role: 'togglefullscreen' }
      ]
    },
    {
      label: t.menu.help || 'Help',
      submenu: [
        { label: t.menu.about || 'About Orgarami', click: openAboutWindow }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: print ─────────────────────────────────────────────────────────────
ipcMain.handle('window:print', async (_event, svgHtml) => {
  return new Promise((resolve) => {
    // Create a hidden print window, inject the SVG, then print
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; }
  @page { margin: 10mm; }
  svg { width:100% !important; height:auto !important; }
</style>
</head>
<body>${svgHtml}</body>
</html>`;

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.webContents.once('did-finish-load', () => {
      win.webContents.print({ silent: false, printBackground: true }, (success, err) => {
        win.close();
        resolve({ success, error: err });
      });
    });
  });
});

// ── IPC: open-file dialog ──────────────────────────────────────────────────
ipcMain.handle('dialog:open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select CSV file',
    filters: [{ name: 'CSV files', extensions: ['csv', 'txt'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return { canceled: true };
  const filePath = filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const s = loadSettings(); s.lastSource = { type: 'file', value: filePath }; saveSettings(s);
    return { canceled: false, content, source: filePath };
  } catch (err) { return { canceled: false, error: err.message }; }
});

// ── IPC: fetch remote URL ──────────────────────────────────────────────────
ipcMain.handle('fetch:remote-url', async (_event, url) => {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    let raw = '';
    const req = lib.get(url, (res) => {
      if (res.statusCode !== 200) { resolve({ error: `HTTP ${res.statusCode}` }); return; }
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        const s = loadSettings(); s.lastSource = { type: 'url', value: url }; saveSettings(s);
        resolve({ content: raw, source: url });
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ error: 'Request timed out' }); });
  });
});

// ── IPC: settings ──────────────────────────────────────────────────────────
ipcMain.handle('settings:get-last-source', () => loadSettings().lastSource || null);

// ── IPC: file ops ──────────────────────────────────────────────────────────
ipcMain.handle('file:reload', async (_event, filePath) => {
  try   { return { content: fs.readFileSync(filePath, 'utf8'), source: filePath }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('dialog:save-file', async (_event, csvContent) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save CSV file', defaultPath: 'orgdata.csv',
    filters: [{ name: 'CSV files', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  try {
    fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8');
    const s = loadSettings(); s.lastSource = { type: 'file', value: filePath }; saveSettings(s);
    return { saved: true, filePath };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('file:save-overwrite', async (_event, filePath, csvContent) => {
  try {
    // ── Auto-backup before overwriting ────────────────────────────────────
    if (fs.existsSync(filePath)) {
      const now   = new Date();
      const stamp = now.getFullYear().toString()
        + String(now.getMonth()+1).padStart(2,'0')
        + String(now.getDate()).padStart(2,'0')
        + '-'
        + String(now.getHours()).padStart(2,'0')
        + String(now.getMinutes()).padStart(2,'0')
        + String(now.getSeconds()).padStart(2,'0');
      const ext    = path.extname(filePath);
      const base   = filePath.slice(0, -ext.length);
      const bakPath = `${base}.${stamp}.bak${ext}`;
      fs.copyFileSync(filePath, bakPath);
    }
    // ── Write ──────────────────────────────────────────────────────────────
    const buf = Buffer.from('\uFEFF' + csvContent, 'utf8');
    const fd  = fs.openSync(filePath, 'w');
    fs.writeSync(fd, buf);
    fs.closeSync(fd);
    return { saved: true };
  } catch (err) {
    return { error: err.message };
  }
});


// ── IPC: visual config ─────────────────────────────────────────────────────
ipcMain.handle('config:load',    ()          => loadConfig());
ipcMain.handle('config:save',    (_e, data)  => { saveConfig(data); return { ok: true }; });
ipcMain.handle('config:reset',   ()          => { saveConfig(CONFIG_DEFAULTS); return CONFIG_DEFAULTS; });
ipcMain.handle('config:defaults',()          => Object.assign({}, CONFIG_DEFAULTS));


// ── i18n ───────────────────────────────────────────────────────────────────
const SUPPORTED_LANGS = ['en', 'tr'];
ipcMain.handle('i18n:detect-language', () => {
  return detectLanguage();
});
function detectLanguage() {
  // 1. User preference in settings
  const settings = loadSettings();
  if (settings.language && SUPPORTED_LANGS.includes(settings.language))
    return settings.language;
  // 2. OS locale (e.g. 'tr-TR' → 'tr')
  const osLang = app.getLocale().split('-')[0].toLowerCase();
  return SUPPORTED_LANGS.includes(osLang) ? osLang : 'en';
}

function loadLocale(lang) {
  const localePath = path.join(__dirname, 'locales', lang + '.json');
  try {
    return JSON.parse(fs.readFileSync(localePath, 'utf8'));
  } catch (_) {
    // Fall back to English
    const fallback = path.join(__dirname, 'locales', 'en.json');
    return JSON.parse(fs.readFileSync(fallback, 'utf8'));
  }
}

ipcMain.handle('i18n:set-language', (_e, lang) => {
  const settings = loadSettings();
  settings.language = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  saveSettings(settings);

  const strings = loadLocale(settings.language);
  buildMenu(strings); // Rebuild menu on the fly!

  return { lang: settings.language, strings };
});
/*
ipcMain.handle('i18n:set-language', (_e, lang) => {
  const settings = loadSettings();
  settings.language = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  saveSettings(settings);
  return { lang: settings.language, strings: loadLocale(settings.language) };
});
*/
ipcMain.handle('i18n:supported-langs', () => SUPPORTED_LANGS);

// ── Lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
