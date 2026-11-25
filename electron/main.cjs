/**
 * ASSOCIATE desktop shell (Electron).
 * Thin client: loads hosted same-origin HTTPS app. No embedded DB/API secrets.
 */
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  resolveDesktopAppUrl,
  isAllowedNavigation,
} = require('./urlConfig.cjs');

const APP_NAME = 'ASSOCIATE IT GST Ledger';
const isPackaged = app.isPackaged;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {ReturnType<typeof resolveDesktopAppUrl> | null} */
let lastResolve = null;
let lastLoadError = '';

function pagesDir() {
  return path.join(__dirname, 'pages');
}

function iconPath() {
  const ico = path.join(__dirname, 'resources', 'icon.ico');
  const png = path.join(__dirname, 'resources', 'icon.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return undefined;
}

function resolveUrl() {
  lastResolve = resolveDesktopAppUrl({
    packaged: isPackaged,
    env: process.env,
    userDataPath: app.getPath('userData'),
    exeDir: path.dirname(app.getPath('exe')),
    resourcesPath: process.resourcesPath,
  });
  return lastResolve;
}

function showLocalPage(name) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const file = path.join(pagesDir(), name);
  void mainWindow.loadFile(file);
}

function loadConfiguredApp() {
  const resolved = resolveUrl();
  lastLoadError = '';
  if (!resolved.ok) {
    showLocalPage('setup.html');
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadURL(resolved.url).catch((err) => {
    lastLoadError = err instanceof Error ? err.message : String(err);
    showLocalPage('offline.html');
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const winIcon = iconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    icon: winIcon,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      /* ignore */
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const resolved = lastResolve;
    if (url.startsWith('file://')) {
      const setup = path.join(pagesDir(), 'setup.html');
      const offline = path.join(pagesDir(), 'offline.html');
      const normalized = decodeURIComponent(url.replace(/\\/g, '/'));
      if (
        normalized.includes(setup.replace(/\\/g, '/')) ||
        normalized.includes(offline.replace(/\\/g, '/'))
      ) {
        return;
      }
      event.preventDefault();
      return;
    }
    if (!resolved?.ok || !resolved.origin) {
      event.preventDefault();
      return;
    }
    if (!isAllowedNavigation(url, resolved.origin)) {
      event.preventDefault();
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' || u.protocol === 'http:') {
          void shell.openExternal(url);
        }
      } catch {
        /* ignore */
      }
    }
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (errorCode === -3) return; // aborted
      if (validatedURL && validatedURL.startsWith('file://')) return;
      lastLoadError = `${errorDescription || 'Load failed'} (${errorCode})`;
      showLocalPage('offline.html');
    }
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  loadConfiguredApp();
}

function registerIpc() {
  ipcMain.handle('desktop:get-shell-info', () => {
    const resolved = lastResolve || resolveUrl();
    return {
      packaged: isPackaged,
      appName: APP_NAME,
      ok: Boolean(resolved?.ok),
      reason: resolved && !resolved.ok ? resolved.reason : null,
      message:
        resolved && !resolved.ok
          ? resolved.message
          : resolved?.ok
            ? 'Configured.'
            : 'Not configured.',
      appUrl: resolved?.ok ? resolved.url : null,
      configPaths: resolved && !resolved.ok ? resolved.configPaths : {
        userData: path.join(app.getPath('userData'), 'desktop-config.json'),
      },
      loadError: lastLoadError || null,
    };
  });

  ipcMain.handle('desktop:retry-load', () => {
    loadConfiguredApp();
    return { ok: true };
  });

  ipcMain.handle('desktop:open-external', (_evt, url) => {
    try {
      const u = new URL(String(url || ''));
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        void shell.openExternal(u.toString());
        return { ok: true };
      }
    } catch {
      /* ignore */
    }
    return { ok: false };
  });
}

app.setName(APP_NAME);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    // Persist cookies for the hosted origin across restarts (HttpOnly server cookies).
    void session.defaultSession;
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
