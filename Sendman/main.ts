import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { registerStoreHandlers } from './store';
import { registerHttpHandlers } from './http';
import { registerRunnerHandlers } from './runner';
import { registerGrpcHandlers } from './grpc';
import { registerWebSocketHandlers } from './websocket';

const APP_NAME = 'Sendman';
app.setName(APP_NAME);
process.title = APP_NAME;
if (process.platform === 'darwin') {
  app.setAboutPanelOptions({ applicationName: APP_NAME });
}

function buildMacMenu() {
  if (process.platform !== 'darwin') return;
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `About ${APP_NAME}` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${APP_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${APP_NAME}` }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0d10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173').catch(err => {
      console.error('Failed to load URL:', err);
    });
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow = win;
  win.on('closed', () => { mainWindow = null; });

  // Log any load failures
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });
}

app.whenReady().then(() => {
  buildMacMenu();
  registerStoreHandlers(ipcMain);
  registerHttpHandlers(ipcMain);
  registerRunnerHandlers(ipcMain);
  registerGrpcHandlers(ipcMain);
  registerWebSocketHandlers(ipcMain, () => mainWindow?.webContents ?? null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
