// Snímky hry ze skrytého okna (nic se uživateli neotevře). Použití: electron tools/shot.cjs <kroky.json> <složka>
// kroky: [{js:"…"} | {jsFile:"soubor.js vedle kroků"} | {wait:ms} | {shot:"název"} | {click:[x,y]} | {key:"m"}]; log.txt obsahuje konzoli a výsledky js.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const [stepsFile, outDir] = process.argv.slice(-2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
const logs = [];
app.whenReady().then(async () => {
  const [w, h] = (process.env.SHOT_SIZE || '1600x1000').split('x').map(Number);
  const win = new BrowserWindow({ width: w, height: h, show: false, webPreferences: { backgroundThrottling: false, partition: 'shot' } }); // vlastní úložiště: nesahá na uloženou hru
  win.webContents.setAudioMuted(true); // zkoušky běží potichu
  win.webContents.on('console-message', (e) => logs.push(`[console] ${e.message}`));
  win.webContents.on('render-process-gone', (e, d) => logs.push('GONE ' + JSON.stringify(d)));
  await win.loadFile(path.join(__dirname, '../index.html'));
  await win.webContents.executeJavaScript('window.__errs = []; addEventListener("error", (e) => __errs.push(e.message)); addEventListener("unhandledrejection", (e) => __errs.push(String(e.reason)));');
  await new Promise((r) => setTimeout(r, 1200));
  for (const s of steps) {
    try {
      if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
      if (s.js) logs.push('JS> ' + JSON.stringify(await win.webContents.executeJavaScript(s.js)));
      if (s.jsFile) logs.push('JS> ' + JSON.stringify(await win.webContents.executeJavaScript(fs.readFileSync(path.resolve(path.dirname(stepsFile), s.jsFile), 'utf8'))));
      if (s.click) for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: s.click[0], y: s.click[1], button: s.button || 'left', clickCount: 1 });
      if (s.move) win.webContents.sendInputEvent({ type: 'mouseMove', x: s.move[0], y: s.move[1] });
      if (s.drag) { // tažení levým tlačítkem po úsečce
        const [x1, y1, x2, y2] = s.drag;
        win.webContents.sendInputEvent({ type: 'mouseMove', x: x1, y: y1 });
        win.webContents.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 });
        for (let i = 1; i <= 20; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: x1 + ((x2 - x1) * i) / 20, y: y1 + ((y2 - y1) * i) / 20, button: 'left' }); await new Promise((r) => setTimeout(r, 15)); }
        win.webContents.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 });
      }
      if (s.key) for (const type of ['keyDown', 'char', 'keyUp']) win.webContents.sendInputEvent({ type, keyCode: s.key });
      if (s.shot) {
        win.webContents.invalidate();
        await win.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
        fs.writeFileSync(path.join(outDir, s.shot + '.png'), (await win.webContents.capturePage()).toPNG());
      }
    } catch (err) { logs.push('STEP ERR ' + err.message); }
  }
  logs.push('ERRS ' + JSON.stringify(await win.webContents.executeJavaScript('window.__errs')));
  fs.writeFileSync(path.join(outDir, 'log.txt'), logs.join('\n'));
  app.quit();
});
