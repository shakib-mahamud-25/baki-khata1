// Every Firebase call lives here, so the UI code never touches the SDK directly.
//
// Firestore layout (see firestore.rules for who may read/write what):
//   users/{uid}          profile + role ('c' customer | 'o' owner). Role can never change.
//   shops/{ownerUid}     public shop directory entry (shop name, owner name, area).
//   ledgers/{id}         one customer <-> one shop (or a private ledger when shopId is null).
//                        Linked ledger id = `${customerUid}_${shopId}` so a link can't be duplicated.
//   entries/{id}         expense ('e') or payment ('p'). Money is integer paisa. Never edited, only
//                        marked removed (linked ledgers) so the shop keeps an honest history.
//   notes/{ledgerId}     the shop owner's private nickname for a customer.
//   recovery/{uid}       hash of the owner's recovery code (write-only; read by the Cloud Function).
import { auth, db, app, RECOVERY, FN_REGION } from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, verifyBeforeUpdateEmail,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, getDocs, collection, query, where,
  onSnapshot, writeBatch, serverTimestamp,
} from 'firebase/firestore';

const PHONE_DOMAIN = 'phone.bakikhata.app';
// Phone-only owners get a hidden email-shaped login ID, e.g. 01711000333@phone.bakikhata.app
export const toEmail = (id) => { id = id.trim(); return id.includes('@') ? id.toLowerCase() : `${id}@${PHONE_DOMAIN}`; };
export const isSynthetic = (email) => !!email && email.endsWith('@' + PHONE_DOMAIN);

const sha = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

export function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint8Array(8));
  const c = [...buf].map((b) => chars[b % chars.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}
async function saveRecovery(uid) {
  const code = newCode();
  await setDoc(doc(db, 'recovery', uid), { hash: await sha(`${uid}:${code}`), attempts: 0 });
  return code;
}

// ── Accounts ────────────────────────────────────────────────────────────────
export async function signUp(f) {
  const cred = await createUserWithEmailAndPassword(auth, toEmail(f.id), f.password);
  const uid = cred.user.uid;
  try {
    const profile = { role: f.role, name: f.name, area: f.area, lang: f.lang, createdAt: serverTimestamp() };
    if (f.role === 'o') profile.shopName = f.shopName;
    if (f.phone) profile.phone = f.phone;
    await setDoc(doc(db, 'users', uid), profile);
    if (f.role === 'o') await setDoc(doc(db, 'shops', uid), { shopName: f.shopName, ownerName: f.name, area: f.area });
    const rec = f.role === 'o' && isSynthetic(cred.user.email) && RECOVERY ? await saveRecovery(uid) : null;
    return { user: cred.user, profile: { ...profile, createdAt: null }, rec };
  } catch (e) {
    await cred.user.delete().catch(() => {}); // don't leave a half-created account behind
    throw e;
  }
}
export const logIn = (id, password) => signInWithEmailAndPassword(auth, toEmail(id), password);
export const logOut = () => signOut(auth);
export const resetEmail = (email) => sendPasswordResetEmail(auth, email.trim().toLowerCase());
export const addEmail = (email) => verifyBeforeUpdateEmail(auth.currentUser, email.trim().toLowerCase());
export const setLangPref = (uid, lang) => updateDoc(doc(db, 'users', uid), { lang });
export async function getProfile(uid) {
  const s = await getDoc(doc(db, 'users', uid));
  return s.exists() ? s.data() : null;
}

// Recovery code (optional; needs the Cloud Function). Only for phone-only owners.
export const rotateCode = (uid) => saveRecovery(uid);
export async function resetWithCode(phone, code, newPassword) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable(getFunctions(app, FN_REGION), 'resetWithRecoveryCode');
  return (await fn({ phone: phone.trim(), code, newPassword })).data; // -> { newCode }
}

// ── Live data ───────────────────────────────────────────────────────────────
// Customers listen to their own ledgers/entries; owners listen to the ones addressed to their shop.
export function subscribe(profile, uid, onChange, onError) {
  const field = profile.role === 'c' ? 'custId' : 'shopId';
  const st = { ledgers: [], entries: [], notes: {} };
  const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const q = (col) => query(collection(db, col), where(field, '==', uid));
  const stops = [
    onSnapshot(q('ledgers'), (s) => { st.ledgers = rows(s); onChange(st); }, onError),
    onSnapshot(q('entries'), (s) => { st.entries = rows(s); onChange(st); }, onError),
  ];
  if (profile.role === 'o') {
    stops.push(onSnapshot(q('notes'), (s) => {
      st.notes = {}; s.docs.forEach((d) => { st.notes[d.id] = d.data().nick; }); onChange(st);
    }, onError));
  }
  return () => stops.forEach((f) => f());
}
export async function listShops() {
  const s = await getDocs(collection(db, 'shops'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Customer actions ────────────────────────────────────────────────────────
const ledgerBase = (profile, uid) => ({
  custId: uid, custName: profile.name, custArea: profile.area, custPhone: profile.phone || null,
  blocked: false, createdAt: serverTimestamp(),
});
export const linkShop = (profile, uid, shop) =>
  setDoc(doc(db, 'ledgers', `${uid}_${shop.id}`), { ...ledgerBase(profile, uid), shopId: shop.id, shopName: shop.shopName, name: null });
export const addPrivate = (profile, uid, name) =>
  addDoc(collection(db, 'ledgers'), { ...ledgerBase(profile, uid), shopId: null, shopName: null, name });
export async function deleteLedger(ledger, entries) {
  const b = writeBatch(db);
  entries.forEach((e) => b.delete(doc(db, 'entries', e.id)));
  b.delete(doc(db, 'ledgers', ledger.id));
  await b.commit();
}
export const addEntry = (l, kind, amount, desc, date) =>
  addDoc(collection(db, 'entries'), {
    ledgerId: l.id, custId: l.custId, shopId: l.shopId || null, kind, amount, desc, date,
    removed: false, flagged: false, received: false, seen: !l.shopId, createdAt: serverTimestamp(),
  });
// Linked ledger: soft-remove (the shop still sees it struck through). Private ledger: real delete.
export const removeEntry = (e) =>
  e.shopId ? updateDoc(doc(db, 'entries', e.id), { removed: true, seen: false }) : deleteDoc(doc(db, 'entries', e.id));

// ── Owner actions ───────────────────────────────────────────────────────────
export const setReceived = (id, v) => updateDoc(doc(db, 'entries', id), { received: v });
export const setFlagged = (id, v) => updateDoc(doc(db, 'entries', id), { flagged: v });
export const setBlocked = (id, v) => updateDoc(doc(db, 'ledgers', id), { blocked: v });
export const setNick = (ledgerId, shopId, nick) => setDoc(doc(db, 'notes', ledgerId), { shopId, nick });
export async function markSeen(ids) {
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, 'entries', id), { seen: true }));
  await b.commit();
}
