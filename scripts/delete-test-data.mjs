// Delete test accounts + test records in one go (free: works on the Firebase Spark plan).
//
// Setup (once):
//   1. Firebase console -> Project settings -> Service accounts -> "Generate new private key".
//      Save it next to package.json as serviceAccount.json. NEVER upload it to GitHub.
//   2. npm install firebase-admin --no-save
//
// Usage (run from the project folder):
//   node scripts/delete-test-data.mjs --dry-run                       # only show what WOULD be deleted
//   node scripts/delete-test-data.mjs                                 # delete EVERYTHING (asks you to confirm)
//   node scripts/delete-test-data.mjs --keep me@gmail.com,01711000333 # keep these accounts and their own data
//
// "--keep" takes emails, or phone numbers for phone-only shop owners. A kept account keeps its profile, shop
// listing, shop code, private ledgers, and linked ledgers whose other side is also kept. Everything else goes.
// Deleting is permanent. Run with --dry-run first.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const COLLECTIONS = ['users', 'shops', 'recovery', 'shopCodes', 'ledgers', 'entries', 'notes'];

// Pure decision logic (exported so it can be tested): which document ids to delete per collection.
// data = { users: [{id, ...fields}], ledgers: [...], ... }, keepUids = array of Firebase Auth uids to keep.
export function decide(data, keepUids) {
  const K = new Set(keepUids);
  const get = (c) => data[c] || [];
  const keepLedger = new Set(
    get('ledgers').filter((l) => K.has(l.custId) && (l.shopId == null || K.has(l.shopId))).map((l) => l.id),
  );
  const keepIf = {
    users: (d) => K.has(d.id),
    shops: (d) => K.has(d.id),
    recovery: (d) => K.has(d.id),
    shopCodes: (d) => K.has(d.shopId),
    ledgers: (d) => keepLedger.has(d.id),
    entries: (d) => keepLedger.has(d.ledgerId),
    notes: (d) => keepLedger.has(d.id),
  };
  const out = {};
  for (const c of COLLECTIONS) out[c] = get(c).filter((d) => !keepIf[c](d)).map((d) => d.id);
  return out;
}

async function main() {
  const require = createRequire(import.meta.url);
  const admin = require('firebase-admin');
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const ki = args.indexOf('--keep');
  const keepIds = ki >= 0 && args[ki + 1] ? args[ki + 1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const toEmail = (x) => (x.includes('@') ? x : `${x}@phone.bakikhata.app`);

  const keyFile = new URL('../serviceAccount.json', import.meta.url);
  let key;
  try { key = JSON.parse(readFileSync(keyFile, 'utf8')); }
  catch { console.error('serviceAccount.json not found next to package.json. See the setup steps at the top of this file.'); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(key) });
  const auth = admin.auth(), db = admin.firestore();

  // all login accounts
  const users = []; let token;
  do { const r = await auth.listUsers(1000, token); users.push(...r.users); token = r.pageToken; } while (token);
  const keepEmails = keepIds.map(toEmail);
  const missing = keepEmails.filter((e) => !users.some((u) => (u.email || '').toLowerCase() === e));
  if (missing.length) { console.error('Not found in Authentication (typo?): ' + missing.join(', ')); process.exit(1); }
  const keepUsers = users.filter((u) => keepEmails.includes((u.email || '').toLowerCase()));
  const dropUsers = users.filter((u) => !keepUsers.includes(u));

  // all records
  const data = {};
  for (const c of COLLECTIONS) data[c] = (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const plan = decide(data, keepUsers.map((u) => u.uid));

  console.log(`\nProject: ${key.project_id}`);
  console.log(`Logins to DELETE: ${dropUsers.length}${dropUsers.length ? '  (' + dropUsers.map((u) => u.email).join(', ') + ')' : ''}`);
  console.log(`Logins to KEEP:   ${keepUsers.length}${keepUsers.length ? '  (' + keepUsers.map((u) => u.email).join(', ') + ')' : ''}`);
  console.log('Records (delete / keep):');
  for (const c of COLLECTIONS) console.log(`  ${c.padEnd(10)} ${String(plan[c].length).padStart(5)} / ${data[c].length - plan[c].length}`);
  if (dry) { console.log('\nDry run only. Nothing was deleted.'); process.exit(0); }

  const total = dropUsers.length + COLLECTIONS.reduce((n, c) => n + plan[c].length, 0);
  if (!total) { console.log('\nNothing to delete.'); process.exit(0); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\nThis is PERMANENT. Type the project id (${key.project_id}) to confirm: `)).trim();
  rl.close();
  if (answer !== key.project_id) { console.log('Not confirmed. Nothing was deleted.'); process.exit(0); }

  const writer = db.bulkWriter();
  for (const c of COLLECTIONS) plan[c].forEach((id) => writer.delete(db.collection(c).doc(id)));
  await writer.close();
  for (let i = 0; i < dropUsers.length; i += 1000) await auth.deleteUsers(dropUsers.slice(i, i + 1000).map((u) => u.uid));
  console.log('Done. Test data deleted.');
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
