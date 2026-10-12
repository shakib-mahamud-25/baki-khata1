import './styles.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, configured, RECOVERY } from './firebase.js';
import * as api from './api.js';
import { hasPin, setPin, checkPin, clearPin } from './pin.js';
import { t, getLang, setLang, getBnDigits, toggleBnDigits, fmt, bd } from './i18n.js';
import { esc, field, authView, pinView, loadingView, setupNeeded, topbar, dashboard, dirHtml, footerHtml, sum } from './views.js';

const $ = (id) => document.getElementById(id);
const day = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// ── State ───────────────────────────────────────────────────────────────────
let scr = 'boot'; // boot | setup | auth | pin | app
let user = null, profile = null, unsub = null, loaded = false;
let fresh = false, signingUp = false, busy = false, ptype = 'f', shopsCache = [];
let shopCode = null, mergeShop = null; const dirState = { q: '', code: null };
const S = { ledgers: [], entries: [], notes: {} };
const auth_ = { view: 'login', role: 'c', route: 'email', err: '', f: {}, fu: null, code: '', recNote: false, next: 'app' };
const pin = { mode: 'verify', buf: '', first: '', tries: 0, err: '', after: null };
const ui = { open: new Set(), tab: {}, flt: 'all', q: '', month: '' };

// Combine ledgers with their entries into one list the views can render.
function model() {
  const by = {};
  S.entries.forEach((e) => (by[e.ledgerId] = by[e.ledgerId] || []).push(e));
  return S.ledgers.map((l) => ({
    ...l, nick: S.notes[l.id] || '',
    exp: (by[l.id] || []).filter((e) => e.kind === 'e'),
    pay: (by[l.id] || []).filter((e) => e.kind === 'p'),
  }));
}
const entryById = (id) => S.entries.find((e) => e.id === id);
const ledgerById = (id) => model().find((l) => l.id === id);

// ── Helpers ─────────────────────────────────────────────────────────────────
function toast(msg, type) {
  const c = $('toast-container'), d = document.createElement('div');
  d.className = 'toast ' + (type || ''); d.textContent = msg; c.appendChild(d);
  setTimeout(() => d.remove(), 2800);
}
function errKey(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'bad';
  if (c === 'auth/email-already-in-use') return 'dup';
  if (c === 'auth/weak-password') return 'pw6';
  if (/network|unavailable/.test(c)) return 'net';
  if (c === 'permission-denied') return 'denied';
  if (c === 'auth/requires-recent-login') return 'reauth';
  if (c === 'auth/too-many-requests') return 'tooMany';
  console.error(e);
  return 'generic';
}
const fail = (e) => toast(t(errKey(e)), 'error');
const snap = () => ['nm', 'sn', 'ar', 'idv', 'ph'].forEach((i) => { const e = $(i); if (e) auth_.f[i] = e.value; });
const toPaisa = (v) => Math.round(parseFloat(v) * 100);
const validId = (v, phone) => (phone ? /^01\d{9}$/.test(v) : /^\S+@\S+\.\S+$/.test(v));
const ctx = () => ({ auth: auth_, pin, recovery: RECOVERY, profile, ledgers: model(), ui, loaded, shopCode });

function render() {
  $('settings-panel').classList.remove('open');
  if (scr !== 'app') { $('settings-panel').innerHTML = ''; $('modal').innerHTML = ''; } // nothing of the last account stays in the page
  const a = $('app');
  if (scr === 'boot') a.innerHTML = loadingView();
  else if (scr === 'setup') a.innerHTML = setupNeeded();
  else if (scr === 'auth') a.innerHTML = authView(ctx());
  else if (scr === 'pin') a.innerHTML = pinView(ctx());
  else { a.innerHTML = topbar(ui.q) + '<div id="dyn"></div>' + footerHtml(); dyn(); }
}
const dyn = () => { const d = $('dyn'); if (d) d.innerHTML = dashboard(ctx()); };

// ── Session flow ────────────────────────────────────────────────────────────
// sign in -> create/enter this device's PIN -> app. Closing the app locks it again.
async function beginSession(u, prof, after) {
  user = u;
  profile = prof || (await api.getProfile(u.uid));
  if (!profile) { toast(t('generic'), 'error'); await api.logOut(); return; }
  if (profile.lang) setLang(profile.lang);
  pin.buf = ''; pin.first = ''; pin.err = ''; pin.tries = 0; pin.after = after || null;
  pin.mode = !fresh && hasPin(u.uid) ? 'verify' : 'setup';
  fresh = false; scr = 'pin'; render();
}
function openApp() {
  scr = 'app'; ui.open = new Set(); ui.q = ''; ui.flt = 'all'; ui.month = '';
  if (profile.role === 'o' && !shopCode) api.ensureShopCode(user.uid).then((c) => { shopCode = c; if (scr === 'app') dyn(); }).catch(fail);
  if (!unsub) {
    loaded = false; let got = 0;
    unsub = api.subscribe(profile, user.uid, (st) => {
      S.ledgers = st.ledgers; S.entries = st.entries; S.notes = st.notes;
      if (++got >= 2) loaded = true;
      if (scr === 'app') dyn();
    }, (e) => fail(e));
  }
  render();
}
async function processPin() {
  pin.err = '';
  if (pin.mode === 'verify') {
    if (await checkPin(user.uid, pin.buf)) return openApp();
    pin.tries++; pin.buf = '';
    if (pin.tries >= 5) { auth_.err = 'pinLock'; return A.logout(); }
    pin.err = t('pinBad');
  } else if (pin.mode === 'setup') { pin.first = pin.buf; pin.buf = ''; pin.mode = 'setup2'; }
  else if (pin.buf !== pin.first) { pin.buf = ''; pin.first = ''; pin.mode = 'setup'; pin.err = t('pinMis'); }
  else {
    await setPin(user.uid, pin.buf); pin.buf = '';
    if (pin.after && pin.after.code) { Object.assign(auth_, { view: 'rec', code: pin.after.code, recNote: false, next: 'app' }); scr = 'auth'; return render(); }
    return openApp();
  }
  render();
}

if (!configured) { scr = 'setup'; render(); }
else {
  render();
  onAuthStateChanged(auth, async (u) => {
    if (signingUp) return;
    if (!u) {
      if (unsub) { unsub(); unsub = null; }
      user = profile = shopCode = null; S.ledgers = []; S.entries = []; S.notes = {}; loaded = false;
      scr = 'auth'; auth_.view = 'login'; return render();
    }
    if (user && user.uid === u.uid && scr !== 'boot') return; // token refresh, nothing to do
    await beginSession(u);
  });
}

// ── Modals ──────────────────────────────────────────────────────────────────
const modal = (title, body) => { $('modal').innerHTML = `<div class="modal-overlay open" data-a="bg"><div class="modal"><div class="modal-title"><span>${title}</span><button class="modal-close" data-a="close">${t('close')}</button></div>${body}</div></div>`; };
const closeM = () => { $('modal').innerHTML = ''; };
const storeModal = () => modal(t('addStore'), `<div class="field"><input id="ss" type="text" placeholder="${esc(t('searchShop'))}" autocomplete="off"></div><div class="sec-t">${t('dirTitle')}</div><div id="dirList"><div class="ledger-empty">${t('loading')}</div></div><div class="sec-t" style="margin-top:18px">${t('typeTitle')}</div><p style="font-size:.8rem;color:var(--text3);margin-bottom:10px">${t('typeHint')}</p>${field('pn', t('shopName'), 'text', '', t('shopPh'))}<button class="btn btn-primary btn-full" data-a="addPriv">${t('add')}</button>`);
const refreshDir = () => { const d = $('dirList'); if (d) d.innerHTML = dirHtml(shopsCache, S.ledgers.map((l) => l.shopId), dirState.q, dirState.code); };
async function onShopSearch(v) { // search by name (instant) and, if it looks like a shop code, by code too
  dirState.q = v; dirState.code = null; refreshDir();
  if (api.isCode(v)) { const sh = await api.shopByCode(v).catch(() => null); if (sh && dirState.q === v) { dirState.code = sh; refreshDir(); } }
}

// ── Actions (wired to data-a="..." attributes) ──────────────────────────────
const A = {
  lang(v) {
    snap(); const open = $('settings-panel').classList.contains('open');
    setLang(v); if (profile) api.setLangPref(user.uid, v).catch(() => {});
    render(); if (open) A.settings();
  },
  view(v) { snap(); auth_.view = v; auth_.err = ''; auth_.fu = null; render(); },
  role(v) { auth_.role = v; if (v === 'c') auth_.route = 'email'; render(); },
  route(v) { snap(); auth_.route = v; auth_.f.idv = ''; render(); },

  async login() {
    if (busy) return; busy = true;
    const id = $('idv').value.trim(); auth_.f.idv = id;
    try { fresh = true; await api.logIn(id, $('pw').value); } // onAuthStateChanged continues the flow
    catch (e) { fresh = false; auth_.err = errKey(e); render(); }
    busy = false;
  },
  async s2() {
    if (busy) return; snap(); const f = auth_.f, pw = $('pw').value;
    const phoneRoute = auth_.role === 'o' && auth_.route === 'phone', id = (f.idv || '').trim();
    auth_.err = '';
    if (!f.nm || !f.ar || !id || !pw || (auth_.role === 'o' && !f.sn)) auth_.err = 'need';
    else if (!validId(id, phoneRoute)) auth_.err = 'badId';
    else if (pw.length < 6) auth_.err = 'pw6';
    if (auth_.err) return render();
    busy = true; signingUp = true;
    try {
      const r = await api.signUp({
        role: auth_.role, name: f.nm.trim(), area: f.ar.trim(), shopName: (f.sn || '').trim(), id, password: pw,
        phone: phoneRoute ? id : (f.ph || '').trim() || null, lang: getLang(),
      });
      auth_.f = {}; fresh = true; signingUp = false;
      await beginSession(r.user, r.profile, r.rec ? { code: r.rec } : null);
    } catch (e) { signingUp = false; auth_.err = errKey(e); render(); }
    busy = false;
  },
  recOk() { if (auth_.next === 'login') { auth_.view = 'login'; render(); } else openApp(); },
  async forgot2() {
    snap(); const id = (auth_.f.idv || '').trim();
    if (!id) { auth_.err = 'need'; return render(); }
    if (id.includes('@')) { api.resetEmail(id).catch(() => {}); toast(t('resetSent'), 'success'); return A.view('login'); }
    if (!RECOVERY) { toast(t('noRecoveryHelp'), 'error'); return; }
    auth_.fu = id; auth_.err = ''; render();
  },
  async doReset() {
    if (busy) return; busy = true;
    try {
      const r = await api.resetWithCode(auth_.f.idv, $('code').value.trim().toUpperCase(), $('npw').value);
      Object.assign(auth_, { view: 'rec', code: r.newCode, recNote: true, next: 'login', fu: null, err: '' });
      toast(t('resetDone'), 'success');
    } catch (e) { auth_.err = e && e.code === 'functions/invalid-argument' ? 'pw6' : e && e.code === 'functions/resource-exhausted' ? 'tooMany' : 'codeBad'; }
    busy = false; render();
  },
  k(v) {
    if (v === 'del') pin.buf = pin.buf.slice(0, -1); else if (pin.buf.length < 6) pin.buf += v;
    render(); if (pin.buf.length === 6) setTimeout(processPin, 120);
  },
  async logout() {
    if (user) clearPin(user.uid);
    if (unsub) { unsub(); unsub = null; }
    await api.logOut(); // onAuthStateChanged shows the login screen
  },
  lock() { pin.mode = 'verify'; pin.buf = ''; pin.err = ''; pin.tries = 0; scr = 'pin'; render(); },

  settings() {
    const p = $('settings-panel'), synthetic = api.isSynthetic(user.email);
    p.innerHTML = `<div class="settings-header"><button class="settings-back" data-a="closeSet">←</button><h2>${t('settings')}</h2></div><div class="settings-body"><div class="settings-section"><h3>${t('account')}</h3><div class="settings-item"><div><div class="settings-item-label">${esc(profile.name)}${profile.shopName ? ' · ' + esc(profile.shopName) : ''}</div><div class="settings-item-sub">${t(profile.role === 'c' ? 'customer' : 'owner')} · ${esc(synthetic ? profile.phone : user.email)}</div></div></div></div><div class="settings-section"><h3>${t('lang')}</h3><div class="radio-group" style="margin-bottom:10px"><div class="radio-option ${getLang() === 'en' ? 'selected' : ''}" data-a="lang" data-v="en">English</div><div class="radio-option ${getLang() === 'bn' ? 'selected' : ''}" data-a="lang" data-v="bn">বাংলা</div></div><div class="settings-item"><div class="settings-item-label">${t('digits')}</div><button class="toggle ${getBnDigits() ? 'on' : ''}" data-a="digits"></button></div><div class="settings-item"><div class="settings-item-label">${t('dark')}</div><button class="toggle ${document.documentElement.dataset.theme === 'dark' ? 'on' : ''}" data-a="dark"></button></div></div>${profile.role === 'o' && shopCode ? `<div class="settings-section"><h3>${t('shopCode')}</h3><div class="code" style="margin-bottom:10px">${esc(shopCode.slice(0, 4) + '-' + shopCode.slice(4))}</div><button class="btn btn-outline btn-full" style="margin-bottom:8px" data-a="copy">${t('copy')}</button><button class="btn btn-outline btn-full" data-a="newShopCode">${t('newShopCode')}</button></div>` : ''}<div class="settings-section"><h3>${t('security')}</h3>${synthetic ? `<button class="btn btn-outline btn-full" style="margin-bottom:8px" data-a="mMail">${t('addMail')}</button>` : ''}${synthetic && RECOVERY && profile.role === 'o' ? `<button class="btn btn-outline btn-full" style="margin-bottom:8px" data-a="mCode">${t('newCode')}</button>` : ''}<button class="btn btn-outline btn-full" style="margin-bottom:8px" data-a="lock">🔒 ${t('lock')}</button><button class="btn btn-danger btn-full" data-a="logout">${t('logout')}</button></div></div>`;
    p.classList.add('open');
  },
  closeSet() { $('settings-panel').classList.remove('open'); },
  digits() { toggleBnDigits(); render(); A.settings(); },
  dark() { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('bk_theme', r.dataset.theme); A.settings(); },
  mMail() { modal(t('addMail'), `${field('em', t('email'), 'email', '')}<button class="btn btn-primary btn-full" data-a="saveMail">${t('save')}</button>`); },
  async saveMail() {
    const v = $('em').value.trim(); if (!validId(v, false)) return toast(t('badId'), 'error');
    try { await api.addEmail(v); closeM(); toast(t('mailSent'), 'success'); } catch (e) { fail(e); }
  },
  async mCode() {
    try {
      const code = await api.rotateCode(user.uid);
      modal(t('newCode'), `<p style="font-size:.82rem;color:var(--text2);margin-bottom:12px">${t('recText')}</p><div class="code">${esc(code)}</div><button class="btn btn-accent btn-full" data-a="close">${t('saved')}</button>`);
    } catch (e) { fail(e); }
  },

  flt(v) { ui.flt = v; dyn(); },
  tog(v) {
    if (ui.open.has(v)) ui.open.delete(v); else {
      ui.open.add(v);
      if (profile.role === 'o') { // opening a customer = the shop has now seen the new entries
        const ids = S.entries.filter((e) => e.ledgerId === v && e.seen === false).map((e) => e.id);
        if (ids.length) api.markSeen(ids).catch(() => {});
      }
    }
    dyn();
  },
  tab(v) { const [i, k] = v.split(':'); ui.tab[i] = k; dyn(); },
  close() { closeM(); },
  bg(v, el, ev) { if (ev.target === el) closeM(); },

  // customer
  async mStore() {
    dirState.q = ''; dirState.code = null; storeModal();
    try { shopsCache = await api.listShops(); } catch (e) { closeM(); return fail(e); }
    refreshDir();
  },
  async link(v) {
    const s = (dirState.code && dirState.code.id === v ? dirState.code : null) || shopsCache.find((x) => x.id === v); if (!s || busy) return; busy = true;
    try { await api.linkShop(profile, user.uid, s); closeM(); toast(t('linkedOk') + s.shopName, 'success'); } catch (e) { fail(e); }
    busy = false;
  },
  async addPriv() {
    const n = $('pn').value.trim(); if (!n) return toast(t('need'), 'error');
    try { await api.addPrivate(profile, user.uid, n.slice(0, 60)); closeM(); } catch (e) { fail(e); }
  },
  mExp(v) { modal(t('expense'), `${field('ea', t('amt'), 'number', '', '0')}${field('ed', t('desc'), 'text', '')}${field('edt', t('date'), 'date', day())}<button class="btn btn-primary btn-full" data-a="addExp" data-v="${v}">${t('add')}</button>`); },
  async addExp(v) {
    const a = toPaisa($('ea').value), l = S.ledgers.find((x) => x.id === v);
    if (!(a > 0) || a > 1e9) return toast(t('badAmt'), 'error');
    if (busy) return; busy = true;
    try { await api.addEntry(l, 'e', a, $('ed').value.trim().slice(0, 200), $('edt').value || day()); closeM(); ui.open.add(v); dyn(); toast('✓ ' + fmt(a), 'success'); } catch (e) { fail(e); }
    busy = false;
  },
  mPay(v) {
    ptype = 'f'; const l = ledgerById(v);
    modal(t('pay'), `<div class="field"><div class="radio-group"><div class="radio-option selected" id="pf" data-a="pt" data-v="f">${t('full')}</div><div class="radio-option" id="pp" data-a="pt" data-v="p">${t('part')}</div></div></div><div id="paf" style="display:none">${field('pa', t('amt'), 'number', '', '0')}</div>${field('pd', t('date'), 'date', day())}<div class="note">${t('balDue')}<b style="color:var(--red)">${fmt(sum(l).b)}</b></div><button class="btn btn-green btn-full" data-a="addPay" data-v="${v}">✓ ${t('confirm')}</button>`);
  },
  pt(v) { ptype = v; $('pf').classList.toggle('selected', v === 'f'); $('pp').classList.toggle('selected', v === 'p'); $('paf').style.display = v === 'p' ? 'block' : 'none'; },
  async addPay(v) {
    const m = ledgerById(v), due = sum(m).b, a = ptype === 'f' ? due : toPaisa($('pa').value);
    if (!(a > 0)) return toast(t('badAmt'), 'error');
    if (a > due) return toast(t('exceeds'), 'error');
    if (busy) return; busy = true;
    try { await api.addEntry(S.ledgers.find((x) => x.id === v), 'p', a, '', $('pd').value || day()); closeM(); dyn(); toast('✓ ' + fmt(a), 'success'); } catch (e) { fail(e); }
    busy = false;
  },
  async del(v) { const e = entryById(v.split(':')[1]); if (e) api.removeEntry(e).catch(fail); },
  async delStore(v) {
    if (!window.confirm(t('confirmDel'))) return;
    const m = ledgerById(v); if (!m || m.shopId) return;
    api.deleteLedger(m, m.exp.concat(m.pay)).catch(fail);
  },

  // customer: link a private ledger (with its history) to a real shop using the shop's code
  mMerge(v) { mergeShop = null; modal(t('mergeTitle'), `<p style="font-size:.85rem;color:var(--text2);margin-bottom:12px">${t('mergeText')}</p>${field('mc', t('shopCodePh'), 'text', '', 'XXXX-XXXX')}<button class="btn btn-primary btn-full" data-a="mFind" data-v="${v}">${t('findShop')}</button>`); },
  async mFind(v) {
    const sh = await api.shopByCode($('mc').value).catch(() => null);
    if (!sh) return toast(t('noShopFound'), 'error');
    mergeShop = sh; const m = ledgerById(v); if (!m) return;
    const n = m.exp.length + m.pay.length;
    modal(t('mergeTitle'), `<div class="dir-item"><div class="store-info"><div class="store-name">${esc(sh.shopName)}</div><div class="store-meta">${esc(sh.ownerName)} · ${esc(sh.area)}</div></div></div><div class="note" style="margin-top:12px">${esc(t('mergeConfirm').replace('%n', bd(n)).replace('%s', sh.shopName))}</div><button class="btn btn-accent btn-full" data-a="doMerge" data-v="${v}">${t('doLink')}</button>`);
  },
  async doMerge(v) {
    const m = ledgerById(v), sh = mergeShop; if (busy || !m || !sh || m.shopId) return;
    const all = m.exp.concat(m.pay); if (all.length > 450) return toast(t('tooBig'), 'error');
    const ex = S.ledgers.find((l) => l.shopId === sh.id); if (ex && ex.blocked) return toast(t('blockedShop'), 'error');
    busy = true;
    try { await api.importPrivate(profile, user.uid, m, all, sh, !!ex); closeM(); toast(t('merged'), 'success'); } catch (e) { fail(e); }
    busy = false;
  },
  month(v) { ui.month = v; dyn(); },
  social() { const o = $('social-overlay'); if (o) o.classList.add('open'); },
  socialClose() { const o = $('social-overlay'); if (o) o.classList.remove('open'); },
  socialBg(v, el, ev) { if (ev.target === el) A.socialClose(); },

  // owner
  copy() { if (shopCode && navigator.clipboard) navigator.clipboard.writeText(shopCode.slice(0, 4) + '-' + shopCode.slice(4)).then(() => toast(t('copied'), 'success')).catch(() => {}); },
  async newShopCode() {
    if (!window.confirm(t('confirmNewCode'))) return;
    try { shopCode = await api.rotateShopCode(user.uid, shopCode); dyn(); A.settings(); } catch (e) { fail(e); }
  },
  rc(v) { const e = entryById(v.split(':')[1]); if (e) api.setReceived(e.id, !e.received).catch(fail); },
  fl(v) { const e = entryById(v.split(':')[1]); if (e) api.setFlagged(e.id, !e.flagged).catch(fail); },
  mNick(v) { modal(t('nick'), `${field('nk', t('nickLbl'), 'text', S.notes[v] || '', 'e.g. Rahim, Room 302')}<button class="btn btn-primary btn-full" data-a="saveNick" data-v="${v}">${t('save')}</button>`); },
  async saveNick(v) { try { await api.setNick(v, user.uid, $('nk').value.trim().slice(0, 60)); closeM(); } catch (e) { fail(e); } },
  block(v) { api.setBlocked(v, true).catch(fail); },
  unblock(v) { api.setBlocked(v, false).catch(fail); },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const f = A[el.dataset.a]; if (f) f(el.dataset.v, el, ev);
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'si') { ui.q = ev.target.value; dyn(); }
  else if (ev.target.id === 'ss') onShopSearch(ev.target.value);
});
document.addEventListener('change', (ev) => { if (ev.target.id === 'msel') A.month(ev.target.value); });
// PWA: lets the app install to the home screen and load its shell offline (see public/sw.js)
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
const theme = localStorage.getItem('bk_theme'); if (theme) document.documentElement.dataset.theme = theme;
