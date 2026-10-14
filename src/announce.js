// Shows the admin's announcement banner and "back soon" maintenance screen to every visitor, live.
// Loaded automatically by the build (see vite.config.js); main.js does not import it.
// Reads one public document: config/site. Silent if it doesn't exist or can't be read.
import { doc, onSnapshot } from 'firebase/firestore';
import { db, configured } from './firebase.js';
import { getLang } from './i18n.js';

const KEY = 'bk_ann_seen';
let cfg = {}, bar = null, wall = null;

const pick = (en, bn) => ((getLang() === 'bn' ? bn || en : en || bn) || '');
const dismissed = (id) => { try { return localStorage.getItem(KEY) === String(id); } catch { return false; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function styles() {
  if (document.getElementById('announce-style')) return;
  const s = document.createElement('style');
  s.id = 'announce-style';
  s.textContent = `
#bk-ann{position:fixed;left:0;right:0;bottom:0;z-index:10001;box-sizing:border-box;min-height:56px;padding:9px 12px calc(9px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:10px;background:#1a6fa8;color:#fff;font:500 .82rem/1.35 'DM Sans','Hind Siliguri',sans-serif}
#bk-ann.warn{background:#c9821a}
#bk-ann span{flex:1}
#bk-ann button{border:0;border-radius:8px;background:rgba(255,255,255,.2);color:#fff;padding:7px 11px;cursor:pointer;font:inherit}
html.bk-an{padding-bottom:calc(56px + env(safe-area-inset-bottom,0px))}
html.bk-an #pin-screen{bottom:calc(56px + env(safe-area-inset-bottom,0px))}
#bk-maint{position:fixed;inset:0;z-index:10002;background:#1a2744;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:'DM Sans','Hind Siliguri',sans-serif}
#bk-maint h1{font:800 1.5rem 'Sora','Hind Siliguri',sans-serif;margin-bottom:12px}
#bk-maint p{max-width:420px;opacity:.85;line-height:1.5;white-space:pre-line}`;
  document.head.appendChild(s);
}

function render() {
  const m = cfg.maintenance, a = cfg.announcement;
  // maintenance wall
  if (m && m.on) {
    styles();
    if (!wall) { wall = document.createElement('div'); wall.id = 'bk-maint'; document.body.appendChild(wall); }
    wall.innerHTML = `<h1>${getLang() === 'bn' ? 'আমরা শীঘ্রই ফিরে আসছি' : 'We’ll be back soon'}</h1><p>${esc(pick(m.msgEn, m.msgBn))}</p>`;
  } else if (wall) { wall.remove(); wall = null; }
  // announcement bar
  const text = a && a.on ? pick(a.textEn, a.textBn) : '';
  if (text && !dismissed(a.id) && !(m && m.on)) {
    styles();
    if (!bar) { bar = document.createElement('div'); bar.id = 'bk-ann'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
    bar.className = a.level === 'warn' ? 'warn' : '';
    bar.innerHTML = `<span>${esc(text)}</span><button data-ann="x" aria-label="Close">✕</button>`;
    document.documentElement.classList.add('bk-an');
  } else if (bar) { bar.remove(); bar = null; document.documentElement.classList.remove('bk-an'); }
}

if (configured && db) {
  onSnapshot(doc(db, 'config', 'site'), (s) => { cfg = s.exists() ? s.data() : {}; render(); }, () => {});
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-ann]') && cfg.announcement) {
      try { localStorage.setItem(KEY, String(cfg.announcement.id)); } catch { /* ignore */ }
      render();
    } else if (e.target.closest && e.target.closest('[data-a=lang]')) setTimeout(render, 0); // follow language changes
  });
}
