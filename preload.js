// Runs in the page's main world before the game script (contextIsolation off, no node in page).
// Hands the game a scaled devicePixelRatio = render scale.
const a = process.argv.find(s => s.startsWith('--bfr-dpr='));
const dpr = a ? parseFloat(a.split('=')[1]) : 0;
if (dpr > 0) Object.defineProperty(window, 'devicePixelRatio', { get: () => dpr, configurable: true });
window.__BFR_DESKTOP = 1;
const v = process.argv.find(s => s.startsWith('--bfr-ver='));
if (v) window.BFR_APP_VERSION = v.slice(10);
