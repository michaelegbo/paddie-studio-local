import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { isDev } from '../utils/constants';
import { store } from '../utils/store';

export function createWindow(rendererURL: string) {
  if (isDev) {
    console.log('Creating window with URL:', rendererURL);
  }

  const bounds = store.get('bounds');

  if (isDev) {
    console.log('restored bounds:', bounds);
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: true,
    show: false,
    backgroundColor: '#0b1020',
    ...bounds,
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    webPreferences: {
      preload: path.join(app.getAppPath(), 'build', 'electron', 'preload', 'index.cjs'),
    },
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  if (isDev) {
    console.log('Window created, loading URL...');
  }

  win.loadURL(rendererURL).catch((err) => {
    console.log('Failed to load URL:', err);
  });

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.log('Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    if (isDev) {
      console.log('Window finished loading');
    }
  });

  // Open devtools in development
  if (isDev) {
    win.webContents.openDevTools();
  }

  win.on('close', () => {
    const bounds = win.getBounds();
    store.set('bounds', bounds);
  });

  return win;
}
