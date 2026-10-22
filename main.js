// Black Forest Racing desktop shell (Electron). Loads the unmodified game HTML offline.
const { app, BrowserWindow, screen, Menu } = require('electron');
const path = require('path'), fs = require('fs');

// GPU flags: use the GPU even if blocklisted, prefer the high-performance adapter,
// no tab/background throttling, uncapped rasterisation.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
if (process.platform === 'win32') app.commandLine.appendSwitch('use-angle', 'd3d11');

// Render scale: internal 3D resolution as a fraction of the window's pixels.
// Set by --render-scale=0.5..1.0 or settings.json {"renderScale": ...} in the user data folder.
// "auto" (default) keeps the internal width at or below 1920 px, so a 2560x1440 screen renders at 0.75.
function readSettings() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')); } catch { return {}; }
}
function argVal(name) {
  const a = process.argv.find(s => s.startsWith('--' + name + '='));
  return a ? a.split('=')[1] : undefined;
}

let win;
function create() {
  const s = readSettings();
  const d = screen.getPrimaryDisplay();
  const physW = d.size.width * d.scaleFactor;
  let rs = argVal('render-scale') ?? s.renderScale ?? 'auto';
  rs = rs === 'auto' ? Math.min(1, 1920 / physW) : Math.max(0.4, Math.min(1, parseFloat(rs) || 1));
  // The game sizes its canvas as innerWidth * min(presetCap, devicePixelRatio), so we hand it a
  // scaled devicePixelRatio; the canvas is then stretched to fill the window.
  const dpr = +(d.scaleFactor * rs).toFixed(3);

  // Windowed by default: last saved size/position, else 80% of the work area (at least 1600x900 if it fits), centered.
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  let st = {}; try { st = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
  const wa = d.workArea;
  const defW = Math.min(wa.width, Math.max(Math.round(wa.width * 0.8), Math.min(1600, wa.width)));
  const defH = Math.min(wa.height, Math.max(Math.round(wa.height * 0.8), Math.min(900, wa.height)));
  const onScreen = st.width && screen.getAllDisplays().some(x => st.x >= x.bounds.x - 50 && st.y >= x.bounds.y - 50 && st.x < x.bounds.x + x.bounds.width && st.y < x.bounds.y + x.bounds.height);
  win = new BrowserWindow({
    width: onScreen ? st.width : defW, height: onScreen ? st.height : defH,
    x: onScreen ? st.x : undefined, y: onScreen ? st.y : undefined, center: !onScreen,
    minWidth: 800, minHeight: 450, resizable: true,
    title: 'Black Forest Racing', icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    fullscreen: !process.env.BFR_TEST && (process.argv.includes('--fullscreen')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: ['--bfr-dpr=' + dpr, '--bfr-ver=' + (require('./package.json').bfrDisplayVersion || ('v' + app.getVersion()))],
      backgroundThrottling: false, contextIsolation: false, nodeIntegration: false, sandbox: false, spellcheck: false,
    },
  });
  if (onScreen && st.maximized) win.maximize();
  const saveState = () => {
    try {
      const b = win.getNormalBounds();
      fs.writeFileSync(statePath, JSON.stringify({ ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() }));
    } catch {}
  };
  win.on('close', saveState);
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'game.html'), { search: process.env.BFR_QUERY || '' });
}

app.whenReady().then(create);
// ---- Auto-update (electron-updater, generic feed) ----
// Feed URL order: BFR_UPDATE_URL env > settings.json "updateUrl" > package.json "bfrUpdateUrl".
// Windows NSIS + Linux AppImage: check on launch, download in background, install on next restart.
// .deb / portable zip: check and notify only.
function neonNotice(text) {
  if (!win || win.isDestroyed()) return;
  const js = `(()=>{let d=document.getElementById('bfrUpd');if(!d){d=document.createElement('div');d.id='bfrUpd';
    d.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99999;padding:10px 16px;border-radius:10px;font:700 14px/1.2 system-ui,sans-serif;letter-spacing:.08em;color:#7ff;background:rgba(5,5,20,.85);border:2px solid #0ff;box-shadow:0 0 12px #0ff,0 0 24px #f0f inset;text-shadow:0 0 6px #0ff;cursor:pointer';
    d.onclick=()=>d.remove();document.body.appendChild(d);setTimeout(()=>d&&d.remove(),15000);}d.textContent=${JSON.stringify(text)};})()`;
  win.webContents.executeJavaScript(js).catch(() => {});
}
function setupUpdates() {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  const pkg = require('./package.json');
  const url = process.env.BFR_UPDATE_URL || readSettings().updateUrl || pkg.bfrUpdateUrl;
  if (readSettings().autoUpdate === false) return;
  const canInstall = process.platform === 'win32' ? !process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Black Forest Racing.exe'))
                   : process.platform === 'linux' ? !!process.env.APPIMAGE : false;
  if (url) autoUpdater.setFeedURL({ provider: 'generic', url }); // else: GitHub Releases feed baked in at build time
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.logger = { info: m => console.log('[upd] ' + m), warn: m => console.log('[upd] ' + m), error: m => console.log('[upd] ' + m), debug() {} };
  autoUpdater.on('update-available', i => { console.log('[upd] available ' + i.version); if (!canInstall) neonNotice('UPDATE ' + i.version + ' AVAILABLE · download the new version'); });
  autoUpdater.on('update-downloaded', i => { console.log('[upd] downloaded ' + i.version); neonNotice('UPDATE READY · v' + i.version + ' installs on next restart'); });
  autoUpdater.on('error', e => console.log('[upd] error ' + (e && e.message)));
  autoUpdater.checkForUpdates().catch(e => console.log('[upd] check failed ' + e.message));
  if (process.env.BFR_UPD_TEST) autoUpdater.on('update-downloaded', () => setTimeout(() => autoUpdater.quitAndInstall(true, false), 3000));
}
app.whenReady().then(() => setTimeout(setupUpdates, 4000));
app.on('ready', () => console.log('[bfr] version ' + app.getVersion()));

app.on('window-all-closed', () => app.quit());

// Smoke-test hook (only when BFR_TEST=<dir> is set): screenshot menu, start a race, screenshot, quit.
if (process.env.BFR_TEST) {
  const out = process.env.BFR_TEST, log = [];
  app.on('web-contents-created', (_, wc) => {
    wc.on('console-message', (e, level, msg) => { if (level >= 3) log.push('console error: ' + msg); });
    wc.on('render-process-gone', (e, d) => log.push('renderer gone: ' + d.reason));
  });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  app.whenReady().then(async () => {
    while (!win) await wait(100);
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await wait(8000);
    fs.writeFileSync(path.join(out, 'menu.png'), (await win.webContents.capturePage()).toPNG());
    const info = await win.webContents.executeJavaScript(`({appVer:window.BFR_APP_VERSION,label:[...document.querySelectorAll('body *')].filter(e=>!e.children.length&&/v1\\.2\\.01/.test(e.textContent)).map(e=>e.textContent.trim()).slice(0,3),dpr:devicePixelRatio,desk:window.__BFR_DESKTOP,gl:!!document.createElement('canvas').getContext('webgl'),renderer:(()=>{try{const g=document.createElement('canvas').getContext('webgl');const x=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(x.UNMASKED_RENDERER_WEBGL)}catch(e){return String(e)}})()})`);
    for (const k of ['Enter','Enter']) { win.webContents.sendInputEvent({type:'keyDown',keyCode:k}); win.webContents.sendInputEvent({type:'keyUp',keyCode:k}); await wait(2500); }
    fs.writeFileSync(path.join(out, 'home.png'), (await win.webContents.capturePage()).toPNG());
    info.homeLabel = await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('bfrVer');return e?[e.textContent,getComputedStyle(e).display]:null})()`).catch(e=>e.message);
    if (process.env.BFR_TEST_HOME) {
      await win.webContents.executeJavaScript(`try{useProfile('Smoke');document.querySelectorAll('.ov,.overlay,.modal').forEach(e=>{});goHome();}catch(e){}`).catch(()=>{});
      await wait(6000);
      info.screens = await win.webContents.executeJavaScript(`[...document.body.children].filter(e=>getComputedStyle(e).display!=='none'&&e.offsetWidth>300).map(e=>e.id||e.className).slice(0,8)`).catch(e=>e.message);
      fs.writeFileSync(path.join(out, 'homescreen.png'), (await win.webContents.capturePage()).toPNG());
      info.homeLabel2 = await win.webContents.executeJavaScript(`(()=>{const e=document.getElementById('bfrVer');return e?[e.textContent,getComputedStyle(e).display]:null})()`).catch(e=>e.message);
    }
    let started;
    try { started = await win.webContents.executeJavaScript(`(()=>{startRace(0,true);return !!race})()`); } catch (e) { log.push('startRace threw: ' + e.message); }
    await wait(25000);
    const raceInfo = await win.webContents.executeJavaScript(`({race:!!race, t:race&&race.t, canvas:[cv.width,cv.height]})`).catch(e => ({ err: e.message }));
    fs.writeFileSync(path.join(out, 'race.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ bounds: win.getBounds(), fullscreen: win.isFullScreen(), info, started, raceInfo, errors: log }, null, 1));
    app.exit(0);
  });
}
