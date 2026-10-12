# Baki Khata v2

A live credit ledger for university-area shops and the students who buy on credit ("baki").
Customers record what they buy and pay; the shop owner sees each customer's due amount **in real time**.

v1 was a single-file, browser-only app. v2 keeps v1's look and moves everything to Firebase.

## How it works

| | Customer (student) | Shop owner |
|---|---|---|
| Signs up with | email + password | email **or** phone + password |
| Always lands on | their shops and what they owe | their customers and what they owe |
| Can | add expenses and payments, link a registered shop, keep private ledgers for shops that are not on the app | see every linked customer live, confirm a payment (✓), flag an entry (⚠), set a private nickname, send an SMS reminder, block a customer |

- **Customer writes, shop views.** No approval flow, so shopkeepers never have to update anything.
- **Honest history.** When a customer deletes an entry on a linked shop, the shop still sees it struck through ("removed by customer"). Entries are never edited.
- **Private ledgers.** A shop that is not on the app is kept as a private ledger, visible only to that customer, stored in their account (survives a new phone or cleared cache).
- **Shop codes.** Each shop has a private code that only the owner sees. A customer who is given it can link an old private ledger to the real shop; the history is copied across and shown to the shop tagged "from customer notes". The code also works in the Add Store search, next to name search.
- **Month filter** (All Time / any month) plus All / Due / Paid on both customer and owner dashboards.
- **Installable PWA** (home-screen icon, loads offline).
- **Roles are permanent** and enforced by the database rules.
- **Daily login = 6-digit PIN** on that device. A new device needs email/password first. The PIN never leaves the device; five wrong tries log you out.
- **English / বাংলা**, selectable in Settings (and on the login screen). Bangla digits are optional.
- **Offline-friendly:** entries made without internet are saved on the device and sync later.
- Money is stored as integer paisa (no floating-point rounding errors).

## Tech

Vanilla JavaScript (ES modules) + [Vite](https://vite.dev), Firebase Auth + Cloud Firestore. No framework, no backend server.
Hosted on Vercel (static). Optional Cloud Function for recovery codes.

## Folder map

```
index.html              page shell
package.json            dependencies and scripts
vercel.json             Vercel settings (security headers)
firebase.json           Firebase CLI settings (only needed if you use the CLI)
firestore.rules         DATABASE SECURITY RULES  <- paste into Firebase console
firestore.indexes.json  (empty, no custom indexes needed)
.env.example            list of environment variables to set
src/
  main.js               app controller: sign-in flow, PIN lock, all button actions
  views.js              turns state into HTML (customer + owner screens)
  api.js                every Firebase call, plus the data layout described at the top
  firebase.js           Firebase setup from environment variables
  pin.js                device PIN (salted PBKDF2 hash, localStorage only)
  i18n.js               English + Bangla strings, money/date formatting
  styles.css            v1 stylesheet + a few v2 additions
public/favicon.svg, manifest.webmanifest, sw.js, icons/   PWA files
functions/              OPTIONAL recovery-code Cloud Function (needs Blaze plan)
scripts/                admin-reset-password.mjs (free manual password reset)
                        delete-test-data.mjs (one-command cleanup before launch)
docs/SETUP.md           step-by-step: GitHub, Firebase, Vercel
```

## Quick start

**Deploying (no coding tools needed):** follow [docs/SETUP.md](docs/SETUP.md).

**Running locally** (optional, needs Node 20.19+ or 22+):

```bash
npm install
cp .env.example .env        # then fill in the Firebase values
npm run dev                 # http://localhost:5173
```

## Cost

Everything below can run on free plans for a campus-scale pilot:

- **GitHub:** free.
- **Vercel Hobby:** free, but Vercel's terms limit Hobby to **non-commercial, personal use**. If the app starts earning money, move to a paid Vercel plan (or host the same build on Firebase Hosting / Cloudflare Pages).
- **Firebase Spark plan:** no card needed and it cannot bill you; when a daily quota runs out the service pauses until it resets. Auth (email/password) and Firestore are used within free quotas. Check current numbers on Firebase's pricing page.
- **Not free (and optional):** the recovery-code Cloud Function needs the **Blaze** (pay-as-you-go, card on file) plan. Without it, phone-only owners can still use the app; for a forgotten password they can add an email in Settings beforehand, or you reset it manually with `scripts/admin-reset-password.mjs`.

## Known limits (v2)

- Only the customer can create entries; the shop cannot add or edit them (by design).
- Payments cannot exceed the current due (checked in the app, not by the database).
- Customers cannot edit entries or unlink a linked shop (history stays with the shop).
- A customer's name/area/phone are copied onto each ledger when they link; later profile edits don't update old ledgers.
- No push notifications yet (the owner sees updates live while the app is open).
- Excel/PDF export from v1 is not included yet.
- Importing a private ledger into a shop copies at most 450 entries at once.
- Shop codes are not a security gate (anyone can already link to any listed shop); they identify the shop and make history import explicit.
- The Bangla text is a first draft and should be reviewed by a native speaker.
- The security rules were written carefully but have not been run against a live Firebase project by the author. Test them with the checklist in docs/SETUP.md before real use.

- Shakib Mahamud
