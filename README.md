# 🏥 Babak Super Health Center — Patient Portal

**For patients:** Announcements · Clinic Schedule · Questions (Q&A) · Online Doctor Consultation (chat with doctor) · "Doctor is IN / No doctor today" status
**For staff (`admin.html`):** Doctor status · Consultations (accept, schedule, advice, live chat) · Answer questions · Announcements · Schedule · Users & Roles

Runs on **GitHub Pages** (free hosting) + **Supabase** (free database/login) + an **Android APK** that GitHub builds for you automatically.

---

## 1. Supabase setup (about 10 minutes)

1. Go to https://supabase.com → **New project** (Free plan). Name it something like `babak-shc-portal`.
2. Open **SQL Editor → New query**, paste **everything** from `supabase/schema.sql`, and click **Run**.
3. Open **Authentication → Sign In / Providers → Email** and turn **OFF "Confirm email"**.
   (Patients log in with a **mobile number**, so there's no real email to confirm.)
4. Open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Put your keys in the app

Open `js/config.js` and paste in:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

You can also set `CENTER_PHONE`, and after step 4, `APK_URL`.

> The anon key is safe to make public. Row Level Security in `schema.sql` makes sure patients only ever see **their own** consultations and messages.

## 3. GitHub Pages

1. Create a repo, e.g. a GitHub org **BabakSHC** with repo **babakshc.github.io** → your site will be `https://babakshc.github.io`
   (or use any repo name → `https://YOUR-NAME.github.io/REPO-NAME`).
2. Upload **all files and folders** from this project, including the hidden `.github` folder.
   Easiest way: GitHub Desktop, or `git push`. (The web uploader may skip `.github`.)
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → `main` / `(root)` → Save.

## 4. Android installer (APK) — built automatically

Each time you push to `main`, **GitHub Actions** builds the APK (about 5–8 minutes).

- Get it from your repo → **Releases** → `BabakSHC-PatientPortal.apk`
- Put that Releases link in `config.js` → `APK_URL: "https://github.com/ORG/REPO/releases/latest"`
  The portal will then show a **"Download Android App"** button.
- Phone install: open the APK → allow **"Install unknown apps"** → Install.

If the first run fails, go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**, then re-run the build from the **Actions** tab.

The app is a **debug-signed APK**, which is fine for direct installs. To publish on the Play Store later, you'll need a release signing key.

Note: the APK packages the web files, so after you change the website, the APK updates on the next build. Data (announcements, chats, etc.) is always live from Supabase.

## 5. Make yourself admin

1. Open the portal → **Account → Register** with your mobile number.
2. In Supabase **SQL Editor**, run:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = '09XXXXXXXXX@babakshc.app');
```

3. Open `admin.html` (or tap **Staff ➜** in the portal). In **Users & Roles**, set doctors to `doctor` and nurses/midwives/BHWs to `staff`.

## Roles

| Role | Can do |
|---|---|
| patient | Read announcements and schedule, ask questions, request consultations, and chat with doctors |
| staff | Everything in the Staff Dashboard except Users & Roles |
| doctor | Same as staff (and gets "Dr." added to name in chats/answers) |
| admin | Everything, including changing roles |

## Password resets

Mobile-number accounts use a fake email, so "send recovery email" won't reach the patient. Instead, run this in the Supabase **SQL Editor** (change the number and the new password):

```sql
update auth.users set encrypted_password = crypt('NEW-PASSWORD', gen_salt('bf'))
where email = '09XXXXXXXXX@babakshc.app';
```

## Privacy note

Consultations hold patient health information. Only give `staff` / `doctor` / `admin` roles to authorized center personnel. Patients agree to a consent checkbox before sending a request (Data Privacy Act of 2012).

## Files

```
index.html          Patient portal (also the Android app)
admin.html          Staff dashboard
js/config.js        ← your Supabase keys
js/common.js        shared helpers
js/portal.js        patient portal logic
js/admin.js         staff dashboard logic
css/style.css       design
supabase/schema.sql database, security rules, sample data
.github/workflows/android.yml   auto-builds the APK
capacitor.config.json, package.json, assets/   Android app settings, icon & splash
```
