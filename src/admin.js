// Hidden admin dashboard (served at /admin). English only.
// Security does not depend on the page being hidden: every read/write below is allowed or refused by
// firestore.rules, and only a login whose uid has an `admins/<uid>` document (created by hand in the
// Firebase console) is accepted. Everyone else just sees a "404".
import './styles.css';
import './admin.css';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, getCountFromServer, query, where,
  updateDoc, setDoc, writeBatch, Timestamp,
} from 'firebase/firestore';
import { auth, db, configured } from './firebase.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = (p) => '৳' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const n = (v) => Number(v).toLocaleString('en-IN');
const DAY = 86400000;
const BADGE = / ✔$/; // a verified shop's name ends with " ✔" (that is how customers see the badge)

const st = { view: '404', clicks: 0, tab: 'overview', err: '', busy: false, d: null, cfg: null, attempted: false };

// ── Data loading ────────────────────────────────────────────────────────────
const rows = (s) => s.docs.map((x) => ({ id: x.id, ...x.data() }));
const count = async (q) => (await getCountFromServer(q)).data().count;

async function loadShops() {
  const [shops, sus] = await Promise.all([getDocs(collection(db, 'shops')), getDocs(collection(db, 'suspendedShops'))]);
  return { shops: rows(shops), sus: rows(sus) };
}
async function load() {
  st.busy = true; st.err = ''; render();
  try {
    const U = collection(db, 'users'), now = Date.now();
    const [users, cust, own, s7, s30] = await Promise.all([
      count(U), count(query(U, where('role', '==', 'c'))), count(query(U, where('role', '==', 'o'))),
      count(query(U, where('createdAt', '>=', Timestamp.fromMillis(now - 7 * DAY)))),
      count(query(U, where('createdAt', '>=', Timestamp.fromMillis(now - 30 * DAY)))),
    ]);
    const sh = await loadShops();
    // Admins only ever read ledgers/entries of REGISTERED shops (one equality query per shop, which is the
    // query shape Firestore's rules can verify). Private ledgers stay private.
    const ids = [...sh.shops, ...sh.sus].map((s) => s.id);
    const per = (c) => Promise.all(ids.map((id) => getDocs(query(collection(db, c), where('shopId', '==', id)))));
    const [ledSnaps, entSnaps] = await Promise.all([per('ledgers'), per('entries')]);
    const led = { docs: ledSnaps.flatMap((x) => x.docs) }, ent = { docs: entSnaps.flatMap((x) => x.docs) };
    const cfg = await getDoc(doc(db, 'config', 'site'));
    st.cfg = cfg.exists() ? cfg.data() : null;
    st.d = { users, cust, own, s7, s30, ...sh, ledgers: rows(led), entries: rows(ent), at: new Date(), reads: 5 + sh.shops.length + sh.sus.length + led.docs.length + ent.docs.length };
  } catch (e) { st.err = explain(e); }
  st.busy = false; render();
}
const explain = (e) => (e && e.code === 'permission-denied' ? 'Permission denied. Check that the admin rules are published and your admins/<uid> document exists.' : String((e && e.message) || e));

function compute(d) {
  const ok = d.entries.filter((e) => !e.removed);
  const sum = (a) => a.reduce((s, e) => s + e.amount, 0);
  const exp = sum(ok.filter((e) => e.kind === 'e')), pay = sum(ok.filter((e) => e.kind === 'p'));
  const recent = d.entries.filter((e) => e.createdAt && e.createdAt.toMillis && Date.now() - e.createdAt.toMillis() < 30 * DAY);
  const shopCount = d.shops.length + d.sus.length;
  const per = {};
  const slot = (id) => (per[id] = per[id] || { cust: new Set(), exp: 0, pay: 0, flagged: 0 });
  d.ledgers.filter((l) => !l.blocked).forEach((l) => slot(l.shopId).cust.add(l.custId));
  ok.forEach((e) => { const p = slot(e.shopId); if (e.kind === 'e') p.exp += e.amount; else p.pay += e.amount; });
  d.entries.filter((e) => e.flagged && !e.removed).forEach((e) => { slot(e.shopId).flagged++; });
  return {
    exp, pay, out: exp - pay, per, shopCount,
    activeUsers: new Set(recent.map((e) => e.custId)).size,
    activeLedgers: new Set(recent.map((e) => e.ledgerId)).size,
    avgExp: d.cust ? exp / d.cust : 0,
    avgOut: shopCount ? (exp - pay) / shopCount : 0,
    flagged: d.entries.filter((e) => e.flagged && !e.removed),
  };
}

// ── Views ───────────────────────────────────────────────────────────────────
const stat = (label, value) => `<div class="ad-stat"><small>${label}</small><b>${value}</b></div>`;

function overview() {
  if (st.busy && !st.d) return '<p class="ad-note">Loading…</p>';
  if (!st.d) return '';
  const d = st.d, c = compute(d);
  return `<div class="ad-grid">
${stat('Total users', n(d.users))}${stat('Customers', n(d.cust))}${stat('Shop owners', n(d.own))}
${stat('Signups · 7 days', n(d.s7))}${stat('Signups · 30 days', n(d.s30))}
${stat('Active users · 30 days', n(c.activeUsers))}${stat('Total shops', n(c.shopCount))}
${stat('Active ledgers · 30 days', n(c.activeLedgers))}${stat('Linked ledgers', n(d.ledgers.length))}${stat('Entries', n(d.entries.length))}
${stat('Total expense', tk(c.exp))}${stat('Total payment', tk(c.pay))}${stat('Total outstanding', tk(c.out))}
${stat('Avg expense / customer', tk(c.avgExp))}${stat('Avg outstanding / shop', tk(c.avgOut))}
</div>
<p class="ad-note">Money and activity cover <b>registered shops only</b>. Customers' private ledgers are never readable by the admin, by design.
"Active" = had a new entry in the last 30 days. Last refreshed ${d.at.toLocaleTimeString()} · about ${n(d.reads)} document reads used.</p>`;
}

function shopsTab() {
  if (!st.d) return '';
  const d = st.d, c = compute(d);
  const rowFor = (s) => {
    const p = c.per[s.id] || { cust: new Set(), exp: 0, pay: 0, flagged: 0 }, verified = BADGE.test(s.shopName || '');
    return `<div class="ad-row"><div class="mid"><b>${esc(s.shopName)}</b><small>${esc(s.ownerName)} · ${esc(s.area)} · ${n(p.cust.size)} customers · due ${tk(p.exp - p.pay)}${p.flagged ? ` · <span class="ad-bad">${p.flagged} flagged</span>` : ''}</small></div>
<button class="ad-mini ${verified ? 'grn' : ''}" data-a="verify" data-v="${esc(s.id)}">${verified ? '✔ Verified (remove)' : 'Mark verified'}</button>
<button class="ad-mini red" data-a="suspend" data-v="${esc(s.id)}">Suspend</button></div>`;
  };
  const susRow = (s) => `<div class="ad-row"><div class="mid"><b>${esc(s.shopName)}</b><small>${esc(s.ownerName)} · ${esc(s.area)}</small></div><button class="ad-mini grn" data-a="unsuspend" data-v="${esc(s.id)}">Restore</button></div>`;
  return `<div class="ad-card"><h3>Shops (${n(d.shops.length)})</h3>${d.shops.map(rowFor).join('') || '<p class="ad-note">No shops yet.</p>'}</div>
<div class="ad-card"><h3>Suspended (${n(d.sus.length)})</h3><p class="ad-note">Suspended shops are removed from the customer directory, cannot be found by code, and customers cannot link to them or add entries. Existing history is kept.</p>${d.sus.map(susRow).join('') || '<p class="ad-note">None.</p>'}</div>`;
}

function flaggedTab() {
  if (!st.d) return '';
  const c = compute(st.d), led = Object.fromEntries(st.d.ledgers.map((l) => [l.id, l]));
  const r = [...c.flagged].sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
    const l = led[e.ledgerId] || {};
    return `<div class="ad-row"><div class="mid"><b>${esc(l.shopName || 'Shop')} ← ${esc(l.custName || 'Customer')}</b><small>${e.kind === 'e' ? 'Expense' : 'Payment'} ${tk(e.amount)} · ${esc(e.date)}${e.imported ? ' · imported' : ''} · ${esc(e.desc || 'no description')}</small></div></div>`;
  }).join('');
  return `<div class="ad-card"><h3>Entries flagged by shops (${n(c.flagged.length)})</h3>${r || '<p class="ad-note">Nothing flagged.</p>'}</div>`;
}

function broadcastTab() {
  const a = (st.cfg && st.cfg.announcement) || {}, m = (st.cfg && st.cfg.maintenance) || {};
  return `<div class="ad-card"><h3>Announcement banner</h3><p class="ad-note">Shown at the bottom of every screen for all users. Users can dismiss it; publishing again shows it to everyone again.</p>
<label class="ad-note"><input type="checkbox" id="an-on" ${a.on ? 'checked' : ''}> Show the banner</label><br>
<select class="ad-sel" id="an-lv"><option value="info" ${a.level !== 'warn' ? 'selected' : ''}>Info (blue)</option><option value="warn" ${a.level === 'warn' ? 'selected' : ''}>Warning (orange)</option></select>
<textarea id="an-en" placeholder="Text in English">${esc(a.textEn)}</textarea><textarea id="an-bn" placeholder="বাংলা টেক্সট">${esc(a.textBn)}</textarea>
<button class="btn btn-accent" data-a="saveAnn">Publish banner</button></div>
<div class="ad-card"><h3>Maintenance mode</h3><p class="ad-note">While on, users see a full-screen "back soon" message instead of the app (this hides the app on screen; it does not block the database). The admin page keeps working.</p>
<label class="ad-note"><input type="checkbox" id="mt-on" ${m.on ? 'checked' : ''}> Maintenance mode on</label><br>
<textarea id="mt-en" placeholder="Message in English">${esc(m.msgEn)}</textarea><textarea id="mt-bn" placeholder="বাংলা বার্তা">${esc(m.msgBn)}</textarea>
<button class="btn btn-accent" data-a="saveMaint">Save maintenance setting</button></div>`;
}

function dangerTab() {
  const t = st.cfg ? st.cfg.testMode === true : null;
  if (t === null) return `<div class="ad-card ad-danger"><h3>Delete test data</h3><p class="ad-note">The <b>config/site</b> document does not exist yet. Create it in the Firebase console with <b>testMode = true</b> (see docs/ADMIN-SETUP.md). The wipe stays disabled until then.</p></div>`;
  if (!t) return `<div class="ad-card ad-danger"><h3>Delete test data</h3><p><span class="ad-bad">Test mode is OFF.</span> The wipe is permanently disabled, so real data is safe. To enable it again you would have to change <b>config/site → testMode</b> by hand in the Firebase console.</p></div>`;
  return `<div class="ad-card ad-danger"><h3>Delete test data</h3>
<p class="ad-note">Test mode is <b class="ad-ok">ON</b>. This deletes <b>all</b> app data: users, shops, ledgers, entries, notes and shop codes. It does <b>not</b> delete logins and does not touch admin settings. Delete logins in Firebase → Authentication → Users (keep your admin login).</p>
<label class="ad-note"><input type="checkbox" id="wchk"> I understand this cannot be undone. Enable the button.</label><br>
<input id="wtxt" type="text" placeholder="Type DELETE" autocomplete="off" style="max-width:240px;padding:9px;margin-bottom:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text)"><br>
<button class="btn btn-danger" id="wbtn" data-a="wipe" disabled>Delete all test data</button></div>
<div class="ad-card"><h3>Finish testing</h3><p class="ad-note">Before launch, turn test mode off. After that the wipe above can never run again from this page.</p>
<button class="btn btn-outline" data-a="lock">Turn off test mode permanently</button></div>`;
}

function render() {
  const r = $('root'); if (!r) return;
  if (st.view === '404') { r.innerHTML = '<div class="nf"><h1 data-a="nf">404</h1><p>This page could not be found.</p></div>'; return; }
  if (st.view === 'login') {
    r.innerHTML = `<div class="lg"><h2>Sign in</h2><div class="field"><label>Email</label><input id="em" type="email" autocomplete="username"></div><div class="field"><label>Password</label><input id="pw" type="password" autocomplete="current-password"></div><p class="ad-bad" style="min-height:1.2em;margin-bottom:8px">${esc(st.err)}</p><button class="btn btn-accent btn-full" data-a="login">Sign in</button></div>`;
    return;
  }
  const tabs = [['overview', 'Overview'], ['shops', 'Shops'], ['flagged', 'Flagged'], ['broadcast', 'Announcements'], ['danger', 'Danger zone']];
  const body = { overview, shops: shopsTab, flagged: flaggedTab, broadcast: broadcastTab, danger: dangerTab }[st.tab]();
  r.innerHTML = `<div class="ad-bar"><div class="ad-tabs">${tabs.map(([k, l]) => `<div class="ad-tab${st.tab === k ? ' on' : ''}" data-a="tab" data-v="${k}">${l}</div>`).join('')}</div><button class="ad-mini" data-a="refresh">${st.busy ? 'Loading…' : '↻ Refresh'}</button><button class="ad-mini" data-a="out">Sign out</button></div>${st.err ? `<div class="ad-card"><p class="ad-bad">${esc(st.err)}</p></div>` : ''}${body}`;
}

// ── Actions ─────────────────────────────────────────────────────────────────
const toastErr = (e) => { st.err = explain(e); render(); };
const delBatch = async (c, ids) => {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db); ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, c, id))); await b.commit();
  }
};

const A = {
  nf() { st.clicks++; if (st.clicks >= 5) st.view = 'login'; render(); },
  async login() {
    st.err = ''; st.attempted = true;
    try { await signInWithEmailAndPassword(auth, $('em').value.trim(), $('pw').value); }
    catch { st.err = 'Sign-in failed.'; st.attempted = false; render(); }
  },
  async out() { st.d = null; st.cfg = null; await signOut(auth); },
  tab(v) { st.tab = v; st.err = ''; render(); },
  refresh() { load(); },
  async verify(id) {
    const s = st.d.shops.find((x) => x.id === id), verified = BADGE.test(s.shopName), base = s.shopName.replace(BADGE, '');
    try { await updateDoc(doc(db, 'shops', id), { shopName: verified ? base : base + ' ✔' }); Object.assign(st.d, await loadShops()); render(); } catch (e) { toastErr(e); }
  },
  async suspend(id) {
    const s = st.d.shops.find((x) => x.id === id);
    if (!window.confirm(`Suspend "${s.shopName}"? It disappears from the directory and customers cannot add entries to it.`)) return;
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'suspendedShops', id), { shopName: s.shopName, ownerName: s.ownerName, area: s.area });
      b.delete(doc(db, 'shops', id)); await b.commit();
      Object.assign(st.d, await loadShops()); render();
    } catch (e) { toastErr(e); }
  },
  async unsuspend(id) {
    const s = st.d.sus.find((x) => x.id === id);
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'shops', id), { shopName: s.shopName, ownerName: s.ownerName, area: s.area });
      b.delete(doc(db, 'suspendedShops', id)); await b.commit();
      Object.assign(st.d, await loadShops()); render();
    } catch (e) { toastErr(e); }
  },
  async saveAnn() {
    const announcement = { on: $('an-on').checked, level: $('an-lv').value, textEn: $('an-en').value.trim().slice(0, 300), textBn: $('an-bn').value.trim().slice(0, 300), id: Date.now() };
    try { await updateDoc(doc(db, 'config', 'site'), { announcement }); st.cfg = { ...st.cfg, announcement }; st.err = ''; render(); } catch (e) { toastErr(e); }
  },
  async saveMaint() {
    const maintenance = { on: $('mt-on').checked, msgEn: $('mt-en').value.trim().slice(0, 300), msgBn: $('mt-bn').value.trim().slice(0, 300) };
    if (maintenance.on && !window.confirm('Turn maintenance mode ON? Users will see a full-screen message instead of the app.')) return;
    try { await updateDoc(doc(db, 'config', 'site'), { maintenance }); st.cfg = { ...st.cfg, maintenance }; st.err = ''; render(); } catch (e) { toastErr(e); }
  },
  async wipe() {
    if ($('wtxt').value !== 'DELETE' || !$('wchk').checked) return;
    if (!window.confirm('Last chance: delete ALL app data now?')) return;
    st.busy = true; st.err = ''; render();
    try {
      const userIds = (await getDocs(collection(db, 'users'))).docs.map((x) => x.id);
      for (const c of ['entries', 'ledgers', 'notes', 'shopCodes', 'shops', 'suspendedShops']) {
        await delBatch(c, (await getDocs(collection(db, c))).docs.map((x) => x.id));
      }
      await delBatch('recovery', userIds); // recovery docs share the user's id
      await delBatch('users', userIds);
      st.d = null; st.busy = false; st.tab = 'overview'; await load();
      st.err = 'Done. App data deleted. Now delete the test logins in Firebase → Authentication (keep your admin login).'; render();
    } catch (e) { st.busy = false; toastErr(e); }
  },
  async lock() {
    if (!window.confirm('Turn off test mode permanently? The wipe will stop working and can only be re-enabled from the Firebase console.')) return;
    try { await updateDoc(doc(db, 'config', 'site'), { testMode: false }); st.cfg = { ...st.cfg, testMode: false }; render(); } catch (e) { toastErr(e); }
  },
};

document.addEventListener('click', (ev) => { const el = ev.target.closest('[data-a]'); if (el && A[el.dataset.a]) A[el.dataset.a](el.dataset.v); });
const arm = () => { const b = $('wbtn'); if (b) b.disabled = !($('wchk').checked && $('wtxt').value === 'DELETE'); };
document.addEventListener('input', arm);
document.addEventListener('change', arm);

// ── Boot ────────────────────────────────────────────────────────────────────
render();
if (configured) {
  onAuthStateChanged(auth, async (u) => {
    if (!u) { st.view = st.clicks >= 5 ? 'login' : '404'; document.title = '404'; return render(); }
    let isAdmin = false;
    try { isAdmin = (await getDoc(doc(db, 'admins', u.uid))).exists(); } catch { /* treated as not admin */ }
    if (isAdmin) { st.view = 'dash'; document.title = 'Admin'; await load(); return; }
    // Not an admin. If they just typed credentials on this page, undo that sign-in. A student who was
    // already signed in to the app is left alone and just sees the 404.
    if (st.attempted) await signOut(auth);
    st.attempted = false; st.view = '404'; st.clicks = 0; document.title = '404'; render();
  });
}
