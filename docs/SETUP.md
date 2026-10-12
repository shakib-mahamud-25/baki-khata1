# Setup guide: GitHub → Firebase → Vercel

Time: about 45 minutes. Cost: **$0** (no card needed) for everything except the optional step 7.
You only need a web browser. Nothing has to be installed on your computer.

You will end up with: code on **GitHub**, data and login on **Firebase**, the website on **Vercel**.
Every time you change a file on GitHub, Vercel republishes the site automatically.

---

## 1. Put the code on GitHub (web upload)

1. **Unzip** `baki-khata-v2.zip` on your computer. GitHub's website cannot open zip files, so upload the *unzipped* files.
2. On github.com, click **+ → New repository**. Name it (for example `baki-khata`). Choose **Private** or Public. Do **not** tick "Add a README". Click **Create repository**.
3. On the empty repo page click **uploading an existing file**.
4. Open the unzipped `baki-khata` folder. Select **everything inside it** (not the folder itself) and drag it into the browser:
   `index.html`, `package.json`, `package-lock.json`, `vercel.json`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `README.md`, and the folders `src`, `public`, `docs`, `functions`, `scripts`.
   - Folder drag-and-drop works in Chrome, Edge and Firefox. Wait until every file shows in the list.
   - **Hidden files:** `.env.example` and `.gitignore` start with a dot and are hidden on macOS (press **Cmd + Shift + .** in Finder to show them). They are optional for this setup. If you skip them, nothing breaks.
5. Scroll down, click **Commit changes**.
6. **Check:** the repository's main page must list `index.html`, `package.json` and `src/` **at the top level**. If you instead see a single `baki-khata` folder, the files went one level too deep: delete the repo's contents and upload again from inside the folder.

> GitHub's web uploader accepts up to 100 files per upload. This project is about 25, so it fits in one go.

---

## 2. Create the Firebase project (free Spark plan)

Go to <https://console.firebase.google.com> and sign in with a Google account.

### 2.1 Project
1. **Create a project** → name it (e.g. `baki-khata`) → Google Analytics is optional, you can turn it off → **Create**.
2. Stay on the **Spark (free)** plan. Do not upgrade.

### 2.2 Web app and keys
1. On the project home, click the **`</>` Web** icon → app nickname `baki-khata-web` → leave "Firebase Hosting" **unticked** → **Register app**.
2. Firebase shows a `firebaseConfig` block. Keep this tab open: you need four values from it
   (`apiKey`, `authDomain`, `projectId`, `appId`). You can find them again any time under **Project settings (⚙️) → Your apps**.
   These values are not secret. The database rules protect your data, not these keys.

### 2.3 Sign-in method
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → enable the first switch (leave "Email link" off) → **Save**.

### 2.4 Database
1. **Build → Firestore Database → Create database**.
2. Location: choose **asia-south1 (Mumbai)** or **asia-southeast1 (Singapore)**, the closest to Bangladesh. **This cannot be changed later.**
3. Start in **production mode** → **Create**.

### 2.5 Security rules (important)
1. In Firestore, open the **Rules** tab.
2. Delete everything there. Open `firestore.rules` from this repository, copy **all** of it, paste it in.
3. Click **Publish**.

Without this step the app shows "Not allowed" errors, because production mode blocks everything by default.

---

## 3. Deploy on Vercel (free Hobby plan)

1. Go to <https://vercel.com> → **Sign up with GitHub**.
2. **Add New… → Project** → find your `baki-khata` repository → **Import**.
3. **Framework Preset** should say **Vite** (it is detected automatically). Leave the build settings as they are.
4. Open **Environment Variables** and add these four (names exactly as written, values from step 2.2):

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | your `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | your `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | your `projectId` |
   | `VITE_FIREBASE_APP_ID` | your `appId` |

5. Click **Deploy**. After about a minute you get an address like `https://baki-khata-xyz.vercel.app`.
6. **Back in Firebase:** Authentication → **Settings → Authorized domains → Add domain** → paste the Vercel address **without** `https://` (for example `baki-khata-xyz.vercel.app`). This is required for password-reset and email-verification links to work.

> If you add or change an environment variable later, go to Vercel → Deployments → **⋯ → Redeploy**. Variables only apply to new builds.

> **Vercel Hobby is free for personal, non-commercial use only.** See "When you outgrow free" below.

---

## 4. First test (10 minutes)

Open your Vercel address. Use two browsers (or one normal window and one private window).

1. **Window A:** *Create account* → **Shop owner** → fill the form → choose **Email** → create the 6-digit PIN. You land on the owner dashboard.
2. **Window B:** *Create account* → **Customer** → PIN. Tap **Add Store** → your shop appears in the list → **Link**.
3. In B: open the shop card → **➕ Expense** → enter 70.
4. In A: Rahim's card shows a **NEW** badge and the 70 appears **live, without refreshing**.
5. In B: **💳 Pay** → partial 20. In A: it appears under *Recent payments*; tap **✓**. B shows "✓ shop confirmed".
6. In B: delete the expense. In A: it stays, struck through as "removed by customer".
7. In B: **Add Store** → type a name that is not on the app → it appears as **Not on app**; open Firestore and see it is visible only in B's data.
8. In A: **Settings → Log out**. Log in again with email and password → the app asks you to **create a PIN for this device**, as designed.
9. Switch to **বাংলা** in Settings or on the login screen.

### Test the security rules (strongly recommended before real students use it)
In Firebase → Firestore → Rules → **Rules Playground**, run these (all should be **denied**):
- *get* `/entries/anyId` while **unauthenticated**.
- *update* `/users/<customer uid>` as that customer, setting `role` to `o`.
- *create* `/entries/x` as a customer with `amount: -5` or with a `custId` that is not theirs.

If any of them is **allowed**, do not go live. Fix the rules first.

---

## 5. Everyday use

- **Change the app:** edit a file on GitHub (pencil icon → Commit). Vercel republishes in about a minute.
- **Customers and owners:** share your Vercel address. Owners should sign up first so they appear in the shop directory.
- **Backups:** scheduled Firestore backups require the paid Blaze plan (check Firebase's docs), so on the free plan assume there are none. Treat this as a pilot, not as the only copy of important money records.

---

## 6. If a phone-only owner forgets their password (free)

Phone-only owners have no email, so no reset email is possible. Options:

1. **Prevention:** tell them to open **Settings → Add an email** right after signing up. Then normal password reset works. After verifying the new email they log in with that email.
2. **You reset it for them** (after you have confirmed who they are):
   1. Firebase console → ⚙️ Project settings → **Service accounts → Generate new private key**. Save it as `serviceAccount.json` in the project folder. **Never upload this file to GitHub.**
   2. On a computer with Node.js: `npm install firebase-admin --no-save`
   3. `node scripts/admin-reset-password.mjs 01711000333 NewPassword123`

---

## 7. Optional: recovery codes (needs the paid Blaze plan)

Skip this unless you want phone-only owners to reset passwords by themselves. It needs a card on file (Blaze), although small usage stays inside Google's free monthly allowance.

1. Firebase console → bottom-left **Upgrade** → Blaze → set a **budget alert** (for example $1) so you are warned about any spending.
2. On a computer with Node.js 22: `npm install -g firebase-tools`, then `firebase login`.
3. In the project folder: `firebase use --add` (pick your project), then `cd functions && npm install && cd ..`, then `firebase deploy --only functions`.
4. In Vercel, add `VITE_RECOVERY_ENABLED` = `true` and **redeploy**.

New phone-only owners will then be shown a one-time recovery code at signup. If you change the function's region in `functions/index.js`, set `VITE_FUNCTIONS_REGION` to match.

---

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| The site says **"Firebase is not configured yet"** | The four `VITE_FIREBASE_*` variables are missing or misspelled in Vercel. Fix them, then **Redeploy**. |
| **"Not allowed"** / `permission-denied` everywhere | Rules were not published (step 2.5), or the pasted text is incomplete. Paste the whole file and Publish. |
| Sign-up fails with `operation-not-allowed` | Email/Password is not enabled (step 2.3). |
| Reset or verification email links fail | The Vercel address is missing from Authentication → Settings → **Authorized domains** (step 3.6). |
| Vercel build fails | Make sure `package.json` and `package-lock.json` are at the repo's top level. The project needs Node 20.19+ (Vercel's default is fine). |
| `npm audit` shows 4 "high" warnings | These come from a server-side part of a Firebase dependency (`@grpc/grpc-js`) that is **not shipped to browsers**. Ignore them. **Do not** run `npm audit fix --force`: it would downgrade Firebase and break the app. |
| Shop is missing from a customer's *Add Store* list | The owner has not signed up yet. Only registered owners appear there. |
| Someone forgot their PIN | Tap "Forgot PIN? Log in again", log in with email/password, and create a new PIN. |
| Page is blank after an update | Hard refresh (Ctrl/Cmd + Shift + R). |

---

## When you outgrow free

- **Vercel Hobby:** Vercel's terms limit it to non-commercial personal use. If the app starts earning money, upgrade Vercel, or host the same build elsewhere (Firebase Hosting, Cloudflare Pages).
- **Firebase Spark:** if a daily quota runs out, the service simply pauses until it resets (it cannot charge you). If that happens regularly, upgrading to Blaze costs only what exceeds the free quota.
- **Custom domain** (like `bakikhata.com.bd`) is the one thing that costs money from day one; the free `*.vercel.app` address works fine for a pilot.
- Check current limits: Firebase pricing page and Vercel's "Hobby plan" page.
