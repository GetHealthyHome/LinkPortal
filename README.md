# LinkPortal

An internal "home screen" for the company's websites and apps. Pick your name
in the top-left corner and you see your own iPad-style grid of app icons.

- **Portal** (`/`): choose your name from the drop-down to see your apps. Tap a folder to open it.
- **Gear icon** (`/settings/:person`): enter your 4-digit PIN, then
  - drag icons to rearrange them,
  - drop one app onto another to make a folder (or onto a folder to add it),
  - tap a folder to rename it, reorder it, take apps out (↑) or ungroup it,
  - tick or untick apps under **Choose your apps**,
  - **Reset to company layout** to go back to the admin's master folders,
  - change your PIN.
- **Admin** (`/admin`, separate password):
  - add and remove people, give them starting apps, and rename them,
  - set a person's PIN, or leave it blank so they create their own the first time
    they tap the gear ("No PIN yet" shows who hasn't). **Reset PIN** can set a new
    PIN, or be left blank to clear it so they create a new one,
  - edit anyone's home screen (no PIN needed while signed in as admin),
  - add, edit and delete apps. The website's own icon is used automatically,
    or you can upload one. An app can be given to everyone at once,
  - create master folders (company categories such as "Sales" or "HR"),
  - change the admin password.

Five wrong PINs lock that person's board for 5 minutes. Five wrong admin
passwords lock admin sign-in for 10 minutes.

## How it's built

- **Frontend:** React + Vite + Tailwind, a static site hosted on Vercel.
- **Data:** Supabase (Postgres). The browser uses only the public *publishable*
  key and can **only** call the database functions in
  `supabase/migrations/…_link_portal.sql`. The tables themselves are locked
  (row level security on, no policies). Functions that change data check a PIN
  session or the admin session first. PINs and the admin password are stored
  as bcrypt hashes, never in plain text.

## Setup

1. **Create the database.** Create a Supabase project, open the **SQL Editor**, and
   run each file in `supabase/migrations/` in order (oldest first), one at a time.
2. **Set the admin password.** In the SQL Editor, run (use your own password):
   ```sql
   update portal_private.admin_settings
   set password_hash = extensions.crypt('your-admin-password', extensions.gen_salt('bf'));
   ```
   The same statement resets the admin password if it's ever forgotten.
3. **Deploy to Vercel.** Import this repository in Vercel (framework: Vite) and add
   two environment variables from Supabase → Project Settings → API Keys:
   - `VITE_SUPABASE_URL`: e.g. `https://abcd1234.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the `sb_publishable_…` key

## Local development

```sh
cp .env.example .env.local   # fill in the two values
npm install
npm run dev
```

`npm run build` type-checks and builds to `dist/`.
