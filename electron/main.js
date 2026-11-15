// Okno hry. Hra sama je čistý web (index.html + ES moduly), Electron jen dává okno a otevírá odkazy na zdroje v prohlížeči.
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const smoke = !!process.env.MYC_SMOKE; // kontrola startu bez okna a bez sahání na uloženou hru: MYC_SMOKE=1 electron .
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1100, minHeight: 700, backgroundColor: '#07080a', autoHideMenuBar: true, title: 'Make Your CPU', show: !smoke,
    webPreferences: smoke ? { partition: 'smoke' } : {} });
  if (smoke) win.webContents.setAudioMuted(true); // kontrola startu běží potichu
  const external = (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); external(url); } });
  win.loadFile(path.join(root, 'index.html'));
  if (smoke) win.webContents.once('did-finish-load', () => setTimeout(async () => {
    console.log('SMOKE', await win.webContents.executeJavaScript('document.title + " | hra: " + !!window.__G?.s + " | budov: " + window.__G?.s?.list.length'));
    app.quit();
  }, 1500));
});
app.on('window-all-closed', () => app.quit());
