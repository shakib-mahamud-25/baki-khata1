// "Install this app" banner shown at the top of the page.
//  - Chrome / Edge / Android: uses the browser's real install prompt (beforeinstallprompt).
//  - iPhone / iPad (Safari has no install prompt): shows the "Share -> Add to Home Screen" steps.
//  - Never shown inside the installed app. If dismissed, it stays away for 14 days.
//  - Self-contained: it injects its own styles, so nothing else needs to change.
import { getLang } from './i18n.js';

const KEY = 'bk_install_off';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const TXT = {
  en: { title: 'Install Baki Khata', sub: 'Open it like an app, even offline.', btn: 'Install', ios: 'To install: tap Share, then “Add to Home Screen”.', ok: 'Got it', no: 'Not now' },
  bn: { title: 'বাকি খাতা ইনস্টল করুন', sub: 'অ্যাপের মতো খুলুন, অফলাইনেও।', btn: 'ইনস্টল', ios: 'ইনস্টল করতে Share চাপুন, তারপর “Add to Home Screen” বেছে নিন।', ok: 'বুঝেছি', no: 'পরে' },
};

const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const snoozed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < SNOOZE_MS; } catch { return false; } };
const remember = (forever) => { try { localStorage.setItem(KEY, String(forever ? Date.now() + 3650 * 86400000 : Date.now())); } catch { /* storage blocked: it will simply show again */ } };
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferred = null, el = null, mode = null;

function injectStyles() {
  if (document.getElementById('install-style')) return;
  const st = document.createElement('style');
  st.id = 'install-style';
  st.textContent = `
#install-banner{position:fixed;top:0;left:0;right:0;z-index:10000;box-sizing:border-box;height:calc(64px + env(safe-area-inset-top,0px));padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px;display:flex;align-items:center;gap:10px;background:#1a2744;color:#fff;border-bottom:2px solid #e8834a;transform:translateY(-110%);transition:transform .3s ease;font-family:'DM Sans','Hind Siliguri',sans-serif}
#install-banner.on{transform:none}
#install-banner img{width:38px;height:38px;border-radius:9px;flex-shrink:0}
#install-banner .ib-t{flex:1;min-width:0;line-height:1.25}
#install-banner .ib-t b{display:block;font-size:.88rem}
#install-banner .ib-t span{display:block;font-size:.74rem;opacity:.75}
#install-banner button{border:0;border-radius:8px;cursor:pointer;font:600 .8rem inherit;font-family:inherit;flex-shrink:0}
#install-banner .ib-go{background:#e8834a;color:#fff;padding:9px 14px}
#install-banner .ib-x{background:rgba(255,255,255,.14);color:#fff;padding:9px 11px}
html.bk-ib{padding-top:calc(64px + env(safe-area-inset-top,0px))}
html.bk-ib #topbar{top:calc(64px + env(safe-area-inset-top,0px))}
html.bk-ib #pin-screen{top:calc(64px + env(safe-area-inset-top,0px))}`;
  document.head.appendChild(st);
}

function render() {
  if (!el) return;
  const s = TXT[getLang()] || TXT.en;
  el.innerHTML = `<img src="/icons/icon-192.png" alt=""><div class="ib-t"><b>${s.title}</b><span>${mode === 'ios' ? s.ios : s.sub}</span></div>` +
    (mode === 'ios'
      ? `<button class="ib-go" data-ib="close">${s.ok}</button>`
      : `<button class="ib-go" data-ib="install">${s.btn}</button><button class="ib-x" data-ib="close" aria-label="${s.no}">✕</button>`);
}
function show(m) {
  if (el || standalone() || snoozed()) return;
  mode = m; injectStyles();
  el = document.createElement('div');
  el.id = 'install-banner'; el.setAttribute('role', 'dialog');
  document.body.appendChild(el); render();
  document.documentElement.classList.add('bk-ib');
  requestAnimationFrame(() => el && el.classList.add('on'));
}
function hide() {
  if (!el) return;
  el.remove(); el = null;
  document.documentElement.classList.remove('bk-ib');
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show('prompt'); });
window.addEventListener('appinstalled', () => { deferred = null; remember(true); hide(); });

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-ib]');
  if (b) {
    if (b.dataset.ib === 'install' && deferred) {
      const d = deferred; deferred = null;
      d.prompt();
      const r = await d.userChoice.catch(() => ({}));
      remember(r.outcome === 'accepted');
    } else remember(false);
    hide();
    return;
  }
  if (ev.target.closest && ev.target.closest('[data-a=lang]')) setTimeout(render, 0); // keep banner language in sync
});

if (isIOS() && !standalone()) setTimeout(() => show('ios'), 1500);
