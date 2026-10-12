// Views only turn state into HTML strings. Every piece of user text goes through esc().
import { t, bd, fmt, fd, getLang } from './i18n.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#e8834a', '#1a6fa8', '#2d8c5e', '#8b5cf6', '#e8396a', '#0891b2', '#c9821a', '#374151'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
const TRASH = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

export const field = (id, label, type, val, ph) =>
  `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''} autocomplete="off"></div>`;
const langSwitch = () => `<div class="lsw"><button class="${getLang() === 'en' ? 'on' : ''}" data-a="lang" data-v="en">EN</button><button class="${getLang() === 'bn' ? 'on' : ''}" data-a="lang" data-v="bn">বাং</button></div>`;
const shell = (inner) => `<div id="pin-screen">${langSwitch()}<div class="pin-logo">Baki <span>Khata</span></div>${inner}</div>`;

export const setupNeeded = () => shell(`<div class="acard"><h2>Firebase is not configured yet</h2><p>This app needs your Firebase keys. Add the <b>VITE_FIREBASE_*</b> environment variables (Vercel → Project → Settings → Environment Variables), then redeploy. Step-by-step: <b>docs/SETUP.md</b> in the repository.</p></div>`);
export const loadingView = () => shell(`<div class="pin-subtitle">${t('loading')}</div>`);

// ── Auth screens ────────────────────────────────────────────────────────────
export function authView(c) {
  const a = c.auth, f = a.f, er = `<div class="aerr">${a.err ? esc(t(a.err)) : ''}</div>`;
  const ownerPhone = a.role === 'o' && a.route === 'phone';
  let b = '';
  if (a.view === 'login') b = `<h2>${t('login')}</h2>${field('idv', t('emailPhone'), 'text', f.idv)}${field('pw', t('password'), 'password')}${er}<button class="btn btn-accent btn-full" data-a="login">${t('login')}</button><button class="alink" data-a="view" data-v="forgot">${t('forgot')}</button><button class="alink" data-a="view" data-v="s1">${t('noAcc')}</button>`;
  if (a.view === 's1') b = `<h2>${t('iam')}</h2><div class="radio-group" style="margin-bottom:12px"><div class="radio-option ${a.role === 'c' ? 'selected' : ''}" data-a="role" data-v="c">🎓<br>${t('customer')}</div><div class="radio-option ${a.role === 'o' ? 'selected' : ''}" data-a="role" data-v="o">🏪<br>${t('owner')}</div></div><p>${t('roleNote')}</p><button class="btn btn-accent btn-full" data-a="view" data-v="s2">${t('cont')}</button><button class="alink" data-a="view" data-v="login">${t('haveAcc')}</button>`;
  if (a.view === 's2') b = `<h2>${t(a.role === 'c' ? 'customer' : 'owner')} · ${t('signup')}</h2>${field('nm', t('name'), 'text', f.nm)}${a.role === 'o' ? field('sn', t('shopName'), 'text', f.sn) : ''}${field('ar', t('area'), 'text', f.ar)}${a.role === 'o' ? `<div class="field"><label>${t('loginWith')}</label><div class="radio-group"><div class="radio-option ${a.route === 'email' ? 'selected' : ''}" data-a="route" data-v="email">${t('email')}</div><div class="radio-option ${a.route === 'phone' ? 'selected' : ''}" data-a="route" data-v="phone">${t('phone')}</div></div></div>` : ''}${field('idv', ownerPhone ? t('phone') : t('email'), ownerPhone ? 'tel' : 'email', f.idv)}${a.role === 'c' ? field('ph', t('phoneOpt'), 'tel', f.ph) : ''}${field('pw', t('password'), 'password')}${ownerPhone && !c.recovery ? `<p>${t('noRecovery')}</p>` : ''}${er}<button class="btn btn-accent btn-full" data-a="s2">${t('cont')}</button><button class="alink" data-a="view" data-v="login">${t('haveAcc')}</button>`;
  if (a.view === 'rec') b = `<h2>${t('recTitle')}</h2><p>${t('recText')}</p>${a.recNote ? `<p>${t('newRecNote')}</p>` : ''}<div class="code">${esc(a.code)}</div><button class="btn btn-accent btn-full" data-a="recOk">${t('saved')}</button>`;
  if (a.view === 'forgot') b = `<h2>${t('forgot')}</h2>${field('idv', t('emailPhone'), 'text', f.idv)}${a.fu ? field('code', t('recCode'), 'text', '', 'XXXX-XXXX') + field('npw', t('newPw'), 'password') : ''}${er}<button class="btn btn-accent btn-full" data-a="${a.fu ? 'doReset' : 'forgot2'}">${t('reset')}</button><button class="alink" data-a="view" data-v="login">${t('login')}</button>`;
  return shell(`<div class="acard">${b}</div>`);
}

export function pinView(c) {
  const p = c.pin, m = p.mode;
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button class="pin-key" data-a="k" data-v="${k}">${bd(k)}</button>`).join('') +
    `<button class="pin-key zero" data-a="k" data-v="0">${bd(0)}</button><button class="pin-key del" data-a="k" data-v="del">⌫</button>`;
  return shell(`<div class="pin-subtitle">${t(m === 'verify' ? 'enterPin' : m === 'setup' ? 'createPin' : 'confirmPin')}</div><div class="pin-dots">${[0, 1, 2, 3, 4, 5].map((i) => `<div class="pin-dot ${i < p.buf.length ? 'filled' : ''}"></div>`).join('')}</div><div class="pin-error">${esc(p.err)}</div><div class="pin-keypad">${keys}</div>${m === 'verify' ? `<button class="alink" style="color:#fff;opacity:.7" data-a="logout">${t('forgotPin')}</button>` : ''}`);
}

// ── App screens ─────────────────────────────────────────────────────────────
export const topbar = (q) => `<div id="topbar"><div class="tb-logo">Baki <span>Khata</span></div><div class="tb-search"><input id="si" type="text" placeholder="${esc(t('search'))}" value="${esc(q)}"></div><div class="tb-actions"><button class="tb-btn" data-a="settings" title="${t('settings')}">⚙️</button></div></div>`;
const banner = (a) => `<div id="balance-banner">${a.map(([k, v, c]) => `<div class="bb-card"><div class="bb-label">${t(k)}</div><div class="bb-value ${c}">${v}</div></div>`).join('')}</div>`;
const filters = (flt) => `<div id="month-bar">${['all', 'due', 'paid'].map((x) => `<div class="filter-tag${flt === x ? ' active' : ''}" data-a="flt" data-v="${x}">${t(x)}</div>`).join('')}</div>`;

export const sum = (l) => {
  const e = l.exp.filter((x) => !x.removed).reduce((s, x) => s + x.amount, 0);
  const p = l.pay.filter((x) => !x.removed).reduce((s, x) => s + x.amount, 0);
  return { e, p, b: e - p };
};
const ms = (e) => (e.createdAt && e.createdAt.toMillis ? e.createdAt.toMillis() : Date.now());
const newest = (a) => [...a].sort((x, y) => y.date.localeCompare(x.date) || ms(y) - ms(x));
const nameOf = (l, role) => (role === 'c' ? (l.shopId ? l.shopName : l.name) : (l.nick || l.custName)) || '';

function row(l, e, role) {
  const rm = e.removed, isE = e.kind === 'e', key = `${l.id}:${e.id}`;
  let tg = '', bt = '';
  if (role === 'o' && e.seen === false) tg += `<span class="tg nw">${t('newB')}</span>`;
  if (rm) tg += `<span class="tg rd">${t(role === 'o' ? 'removed' : 'rmC')}</span>`;
  if (e.received) tg += `<span class="tg gr">${t('conf')}</span>`;
  if (e.flagged) tg += `<span class="tg yl">${t('flagged')}</span>`;
  if (role === 'c' && !rm) bt = `<button class="ledger-del" data-a="del" data-v="${key}">${TRASH}</button>`;
  if (role === 'o' && !rm) {
    if (!isE) bt += `<button class="ib ${e.received ? 'on' : ''}" data-a="rc" data-v="${key}">✓</button>`;
    bt += `<button class="ib ${e.flagged ? 'on y' : ''}" data-a="fl" data-v="${key}">⚠</button>`;
  }
  return `<div class="ledger-item${rm ? ' rm' : ''}"><div class="ledger-icon ${isE ? 'exp' : 'pay'}">${isE ? '🛒' : '💳'}</div><div class="ledger-details"><div class="ledger-desc">${esc(e.desc || t(isE ? 'expense' : 'pay'))}</div><div class="ledger-date">${fd(e.date)}${tg}</div></div><div class="ledger-amount ${isE ? 'exp' : 'pay'}">${fmt(e.amount)}</div>${bt}</div>`;
}

function card(l, role, ui) {
  const s = sum(l), isPaid = s.b <= 0, isOpen = ui.open.has(l.id), tb = ui.tab[l.id] || 'e';
  const nm = nameOf(l, role), ini = nm.split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const where = role === 'c' ? (l.shopId ? t('linked') : t('priv')) : (l.nick ? l.custName + ' · ' : '') + (l.custArea || '');
  const meta = `${where} · ${bd(l.exp.length)} ${t('expenses')} · ${bd(l.pay.length)} ${t('payments')}`;
  const eh = l.exp.length ? newest(l.exp).map((e) => row(l, e, role)).join('') : `<div class="ledger-empty">${t('noExp')}</div>`;
  const ph = l.pay.length ? newest(l.pay).map((e) => row(l, e, role)).join('') : `<div class="ledger-empty">${t('noPay')}</div>`;
  let acts;
  if (role === 'c') {
    acts = l.blocked ? `<div class="note" style="margin:0;grid-column:1/-1">${t('blockedBy')}</div>`
      : `<button class="store-action-btn sab-expense" data-a="mExp" data-v="${l.id}">➕ ${t('expense')}</button>${isPaid ? '' : `<button class="store-action-btn sab-pay" data-a="mPay" data-v="${l.id}">💳 ${t('pay')}</button>`}${l.shopId ? '' : `<button class="store-action-btn sab-del" data-a="delStore" data-v="${l.id}">🗑 ${t('del')}</button>`}`;
  } else {
    const sms = `sms:${esc(l.custPhone || '')}?body=${encodeURIComponent(l.custName + ', ' + t('balDue') + fmt(s.b) + ' — ' + l.shopName)}`;
    acts = l.blocked ? `<button class="store-action-btn sab-pay" data-a="unblock" data-v="${l.id}">${t('unblock')}</button>`
      : `<a class="store-action-btn sab-expense" style="text-decoration:none;text-align:center" href="${sms}">💬 ${t('remind')}</a><button class="store-action-btn sab-pdf" data-a="mNick" data-v="${l.id}">✏️ ${t('nick')}</button><button class="store-action-btn sab-del" data-a="block" data-v="${l.id}">🚫 ${t('block')}</button>`;
  }
  const nn = role === 'o' ? l.exp.concat(l.pay).filter((e) => e.seen === false).length : 0;
  return `<div class="store-card${isOpen ? ' open' : ''}${l.blocked ? ' dim' : ''}"><div class="store-header" data-a="tog" data-v="${l.id}"><div class="store-avatar" style="background:${COLORS[hash(l.id) % 8]}">${esc(ini)}</div><div class="store-info"><div class="store-name">${esc(nm)}${nn ? `<span class="tg nw">${bd(nn)} ${t('newB')}</span>` : ''}</div><div class="store-meta">${esc(meta)}</div></div><div class="store-balance-pill ${isPaid ? 'pill-paid' : 'pill-due'}">${isPaid ? t('cleared') : fmt(s.b) + ' ' + t('dueW')}</div><svg class="store-chevron" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div><div class="store-body"><div class="store-stats"><div class="stat-box"><div class="stat-label">${t('Expenses')}</div><div class="stat-value" style="color:var(--red)">${fmt(s.e)}</div></div><div class="stat-box"><div class="stat-label">${t('paid').replace(/^\S+\s/, '')}</div><div class="stat-value" style="color:var(--green)">${fmt(s.p)}</div></div><div class="stat-box"><div class="stat-label">${t('out')}</div><div class="stat-value" style="color:${isPaid ? 'var(--green)' : 'var(--red)'}">${fmt(s.b)}</div></div></div><div class="store-actions${isPaid || role === 'o' ? ' no-pay' : ''}">${acts}</div><div class="ledger-tabs"><div class="ledger-tab${tb === 'e' ? ' active' : ''}" data-a="tab" data-v="${l.id}:e">${t('Expenses')} (${bd(l.exp.length)})</div><div class="ledger-tab${tb === 'p' ? ' active' : ''}" data-a="tab" data-v="${l.id}:p">${t('Payments')} (${bd(l.pay.length)})</div></div><div class="ledger-panel${tb === 'e' ? ' active' : ''}">${eh}</div><div class="ledger-panel${tb === 'p' ? ' active' : ''}">${ph}</div></div></div>`;
}

const visible = (ls, role, ui) => ls.filter((l) => nameOf(l, role).toLowerCase().includes(ui.q.toLowerCase().trim()) && (ui.flt === 'all' || (ui.flt === 'due') === (sum(l).b > 0)));

export function dashboard(c) {
  const { profile, ledgers, ui, loaded } = c, role = profile.role;
  if (!loaded) return `<div id="main"><div class="note">${t('loading')}</div></div>`;
  let e = 0, p = 0; ledgers.forEach((l) => { const s = sum(l); e += s.e; p += s.p; });
  if (role === 'c') {
    const list = visible(ledgers, 'c', ui).map((l) => card(l, 'c', ui)).join('') || `<div class="ledger-empty">${t('empty')}</div>`;
    return banner([['tExp', fmt(e), 'red'], ['tPaid', fmt(p), 'green'], ['out', fmt(e - p), e - p > 0 ? 'red' : 'green'], ['shops', bd(ledgers.length), 'blue']]) +
      `<div id="main">${filters(ui.flt)}<div id="action-bar"><button class="btn btn-primary btn-full" data-a="mStore">＋ ${t('addStore')}</button></div>${list}</div>`;
  }
  const rp = ledgers.flatMap((l) => l.pay.filter((x) => !x.removed).map((x) => ({ l, x }))).sort((a, b) => b.x.date.localeCompare(a.x.date) || ms(b.x) - ms(a.x)).slice(0, 3);
  const strip = rp.length ? `<div class="sec-t">${t('recent')}</div><div class="store-card" style="padding:0 16px">${rp.map(({ l, x }) => `<div class="ledger-item"><div class="ledger-icon pay">💳</div><div class="ledger-details"><div class="ledger-desc">${esc(nameOf(l, 'o'))}</div><div class="ledger-date">${fd(x.date)}${x.received ? `<span class="tg gr">${t('conf')}</span>` : ''}</div></div><div class="ledger-amount pay">${fmt(x.amount)}</div><button class="ib ${x.received ? 'on' : ''}" data-a="rc" data-v="${l.id}:${x.id}">✓</button></div>`).join('')}</div>` : '';
  const list = visible(ledgers, 'o', ui).sort((a, b) => sum(b).b - sum(a).b).map((l) => card(l, 'o', ui)).join('') || `<div class="ledger-empty">${t('empty')}</div>`;
  return banner([['totDue', fmt(e - p), e - p > 0 ? 'red' : 'green'], ['collected', fmt(p), 'green'], ['custs', bd(ledgers.length), 'blue']]) +
    `<div id="main"><div class="note">🏪 ${t('listed')} <b>${esc(profile.shopName)}</b> · ${esc(profile.area)}</div>${strip}${filters(ui.flt)}${list}</div>`;
}

// Used by the "Add Store" dialog
export const directoryRows = (shops, linkedIds) => shops.map((u) => `<div class="dir-item"><div class="store-avatar" style="background:${COLORS[hash(u.id) % 8]}">${esc((u.shopName || '?').slice(0, 2).toUpperCase())}</div><div class="store-info"><div class="store-name">${esc(u.shopName)}</div><div class="store-meta">${esc(u.ownerName)} · ${esc(u.area)}</div></div>${linkedIds.includes(u.id) ? `<span class="tg gr">${t('linked')}</span>` : `<button class="btn btn-accent" style="padding:8px 14px" data-a="link" data-v="${u.id}">${t('link')}</button>`}</div>`).join('') || `<div class="ledger-empty">${t('empty')}</div>`;
