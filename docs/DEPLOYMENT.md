# Momentum — Deployment

How to run Momentum for real: a hosted Supabase project for the database and auth, and
Vercel for the Next.js app. One person, one account, no shared infrastructure. Everything
below was written against the state of the repository on 2026-09-09; the local development
setup in `README.md` is unchanged by any of it.

---

## 1. What you need

- The GitHub repository (`kevzho/momentum`) — Vercel deploys from it.
- A Supabase account and the Supabase CLI (`brew install supabase/tap/supabase`).
- A Vercel account with the GitHub integration, or the Vercel CLI (`npm i -g vercel`).
- Node 22.12 or newer and pnpm 10 locally (the repo pins `24` in `.node-version`).

## 2. Supabase: create the hosted project

1. In the Supabase dashboard create a project (pick the region nearest you; note the
   database password — you will not need it day to day, but the CLI asks for it once).
2. From the repository root, link the project and apply the migrations:

   ```
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   supabase migration list      # every file under supabase/migrations should show as applied
   ```

   **Never run `supabase db reset --linked` and never load `supabase/seed.sql` into a hosted
   project.** The seed creates two demo accounts with a known password and eight weeks of
   fake history; it exists for local development and the test suites only. Achievement,
   quest and cosmetic *definitions* are seeded by the migrations themselves, so a fresh
   account still gets quests and achievements.

3. Copy the keys from **Project Settings → API keys**: the project URL
   (`https://<project-ref>.supabase.co`) and the **publishable** key (`sb_publishable_…`;
   the legacy `anon` JWT also works). Nothing in the app ever uses the secret key.

## 3. Supabase: auth settings

The local `supabase/config.toml` is development-shaped and does **not** carry these values
to a hosted project. Set them in **Authentication → URL configuration** and
**Authentication → Email**:

| Setting | Value |
| --- | --- |
| Site URL | your public origin, e.g. `https://momentum-<you>.vercel.app` (update it again if you add a custom domain) |
| Redirect URLs | `https://<origin>/auth/callback` and `https://<origin>` |
| Confirm email | **on** (the sign-up form already handles the "check your email" reply) |
| Secure password change | optional; the app's `/update-password` page works either way |
| Email template › Reset password | paste the body of `supabase/templates/recovery.html`; subject `Reset your Momentum password` |

The recovery template sends a `token_hash` link (`{{ .SiteURL }}/auth/callback?token_hash=…&type=recovery&next=/update-password`),
which is what lets the link work from any browser or a phone. It relies on **Site URL**
being your real origin.

The default Supabase mailer is rate-limited (a few messages an hour) and fine for one
person. Configure custom SMTP under **Authentication → SMTP** only if you invite others.

## 4. Vercel: deploy the app

The app lives in `apps/web` inside a pnpm workspace. Vercel understands workspaces as
long as the root directory is set.

1. **Add New → Project**, import `kevzho/momentum`.
2. **Root Directory:** `apps/web`. Framework preset: Next.js (detected). Leave the build
   and install commands at their defaults — Vercel runs `pnpm install` at the workspace
   root and `next build` in `apps/web`.
3. **Node.js version:** 22.x or newer (Project Settings → General).
4. **Environment variables** (Production, and Preview if you use it):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key from step 2.3 |
   | `NEXT_PUBLIC_APP_URL` | the deployment's origin, e.g. `https://momentum-<you>.vercel.app` |

   `NEXT_PUBLIC_BUILD_VERSION` is derived from `VERCEL_GIT_COMMIT_SHA` automatically; it
   is what tells an open tab that a new build exists.
5. Deploy. Then go back to Supabase (§3) and make sure **Site URL** and the redirect URLs
   match the origin Vercel gave you. Update `NEXT_PUBLIC_APP_URL` if it differs.

From the CLI instead of the dashboard:

```
cd apps/web
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_APP_URL production
vercel --prod
```

Every push to `main` redeploys. Preview deployments get a different origin; either add
`https://*-<team>.vercel.app` to the Supabase redirect list or sign in on production only.

## 5. First run

1. Open the deployed URL, **Sign up** with your email, confirm from the email, and check the
   timezone the form suggested (it reads the device's zone; the profile's zone is what every
   date boundary uses).
2. **Settings** → working hours and focus windows; these drive capacity and Find Time.
3. Create your projects from the sidebar's **New project**, then capture tasks with `Q`.
4. Install it: Chrome/Edge offer "Install Momentum" from the address bar; iOS Safari uses
   Share → Add to Home Screen.

## 6. Day two and after

- **Schema changes** ship as migrations: commit the file, then `supabase db push`.
- **Export** your data any time from Settings → Data (a JSON file of every table you own).
- **Backups**: Supabase's daily backups cover the database; the export is your own copy.
- **Logs**: Vercel → Deployments → Functions for server errors; Supabase → Logs → Auth for
  sign-in and email delivery.

## 7. Things that differ from local development

- The hosted API gateway enforces API keys; use the publishable key, never the legacy
  service-role key, in the app's environment.
- Cookies are `Secure` in production (they are not on `http://localhost`), and HSTS is sent.
- `/update-password` accepts a signed-in session without re-entering the current password;
  it is listed as an accepted risk in `docs/ROADMAP.md`.
- The Content-Security-Policy ships only `frame-ancestors 'none'`; a full `script-src`
  policy is a known follow-up.
