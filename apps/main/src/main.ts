import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { Services } from './services.js';
import { registerIpc, pushSessions } from './ipc.js';
import { logger } from './logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const services = new Services();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    backgroundColor: '#131518',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // hard security defaults — Node reachable only through the typed preload
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(here, 'preload.cjs'),
    },
  });

  const dispose = pushSessions(services, win.webContents);
  win.on('closed', dispose);

  const devUrl = process.env['ANCHOR_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(here, '..', 'renderer', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await services.start();
  registerIpc(services);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  logger.error('main', 'startup failed', { err: String(err) });
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => services.stop());
