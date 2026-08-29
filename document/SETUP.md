# CreditSense AI — Setup & Local Development

How to get the project running on your machine from a fresh clone.

📄 **[Problem Statement](README.md)** · 🛠 **[Tech Stack](TECH_STACK.md)** · 🗺 **[Build Phases](../README.md)**

> **Current state:** Phase 0 is done — the app is scaffolded, the design system is in place, and it connects to the Supabase database. Follow **[Quick Start](#quick-start)** below. The [First-Time Scaffold](#first-time-scaffold-phase-0) section is kept only as a record of how the project was created.

---

## 1. Prerequisites

| Tool | Version | Check with |
|------|---------|-----------|
| **Node.js** | 20 LTS or newer (22.x recommended) | `node -v` |
| **npm** | 10 or newer | `npm -v` |
| **Git** | any recent version | `git --version` |
| **Supabase account** | free tier is enough | [supabase.com](https://supabase.com) |
| **Vercel account** | free tier is enough (only needed to deploy) | [vercel.com](https://vercel.com) |

**Recommended VS Code extensions:** ESLint, Prettier, Tailwind CSS IntelliSense.

---

## 2. Quick Start

For everyone joining after the project has been scaffolded.

```bash
# 1. Clone
git clone https://github.com/daniyal-devx/creditsense-ai.git
cd creditsense-ai

# 2. Install dependencies
npm install

# 3. Create your local env file
cp .env.example .env.local     # Windows PowerShell: copy .env.example .env.local

# 4. Fill in .env.local with your Supabase keys (see section 3)

# 5. Run the dev server
npm run dev
```

Open **http://localhost:3000**.

---

## 3. Environment Variables

Create a `.env.local` file in the repo root. **Never commit it** — it is gitignored.

```env
# Supabase (database only — we do not use Supabase Auth)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Our custom auth
JWT_SECRET=<a-long-random-string>

# Gmail SMTP — verification codes and transactional email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
GMAIL_USER=<your-gmail-address>
GMAIL_APP_PASSWORD=<16-character-app-password>
EMAIL_FROM="CreditSense AI <your-gmail-address>"

# Google OAuth — "Continue with Google"
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Base URL — used to build OAuth redirect URIs and email links
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Where to find the Supabase keys

1. Go to your Supabase project → **Project Settings → API**
2. **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

### Generating a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `GMAIL_APP_PASSWORD`, and `GOOGLE_CLIENT_SECRET` are server-only.** They must never be prefixed with `NEXT_PUBLIC_` — that would ship them to the browser. Only ever read them inside API routes or server components.

---

## 3a. Gmail SMTP Setup

We send verification codes and transactional email through Gmail SMTP. This needs an **App Password**, not your normal Gmail password.

1. Use a dedicated Gmail account for the project if you can — not your personal inbox
2. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
3. **Enable 2-Step Verification** — App Passwords do not exist without it
4. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
5. Create an app password named `CreditSense`
6. Copy the **16-character password** into `GMAIL_APP_PASSWORD` — Google displays it with spaces, paste it **without** them

**Verify it works:**

```bash
npm run email:test
```

| Problem | Cause |
|---------|-------|
| `535-5.7.8 Username and Password not accepted` | Using your real Gmail password instead of an App Password, or spaces left in the pasted value |
| App Passwords page is missing | 2-Step Verification is not enabled yet |
| `Connection timeout` on port 587 | Your network blocks SMTP — try port `465`, or a different network |
| Emails land in spam | Expected for a raw Gmail sender in dev. Fine for the demo; use a real transactional provider before production |

> ⚠️ **Gmail SMTP allows roughly 500 emails per day.** Plenty for development and the hackathon demo — not for production scale.

---

## 3b. Google OAuth Setup ("Continue with Google")

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project
2. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name, support email, and developer contact
   - Scopes: `userinfo.email` and `userinfo.profile` are enough
   - While the app is in **Testing**, add every teammate's Google account under **Test users** or their sign-in will be blocked
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `https://<your-vercel-domain>.vercel.app`
   - **Authorized redirect URIs:**
     - `http://localhost:3000/api/auth/google/callback`
     - `https://<your-vercel-domain>.vercel.app/api/auth/google/callback`
4. Copy the **Client ID** and **Client Secret** into `.env.local`

> The redirect URI must match **character for character** — a trailing slash or `http` vs `https` mismatch causes `redirect_uri_mismatch`. This is the single most common failure here.

---

## 4. Database Setup

We use Supabase **purely as a hosted PostgreSQL database**. Auth and all application logic are ours.

1. Create a new project at [supabase.com](https://supabase.com) (pick the region closest to you)
2. Save the database password somewhere safe — you will need it for direct SQL access
3. Open the **SQL Editor** in the Supabase dashboard
4. Run the migration files in order from `supabase/migrations/`
5. Run the seed script to load demo data:

```bash
npm run db:seed
```

The seed loads the synthetic Pakistani informal-worker personas (freelancer, shopkeeper, driver, online seller) with their wallet, top-up, and bill payment history, so the scoring modules have something to work with immediately.

> Schema and seed scripts land in **Phase 1**. Until then, steps 4–5 have nothing to run.

---

## 5. Available Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server at `localhost:3000` with hot reload |
| `npm run build` | Production build — run this before pushing to catch build errors |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler with no emit |
| `npm run db:seed` | Load demo data into the database |
| `npm run email:test` | Send a test email to confirm Gmail SMTP is configured correctly |

---

## 6. Project Structure

```
creditsense-ai/
├── document/              # Project docs (you are here)
│   ├── README.md          # Problem statement
│   ├── TECH_STACK.md      # Stack decisions
│   └── SETUP.md           # This file
├── src/
│   ├── app/               # Next.js App Router
│   │   ├── (auth)/        # Login and session pages
│   │   ├── (dashboard)/   # Role-based dashboards
│   │   └── api/           # API routes — our custom auth lives here
│   ├── components/        # Shared UI components
│   ├── lib/
│   │   ├── supabase/      # Database client
│   │   ├── auth/          # Session, hashing, role checks, Google OAuth
│   │   ├── email/         # Nodemailer client + HTML email templates
│   │   ├── scoring/       # CreditSense Score + affordability
│   │   └── fraud/         # FraudSense detection + graph
│   └── types/             # Shared TypeScript types
├── supabase/
│   ├── migrations/        # SQL schema migrations
│   └── seed/              # Demo data scripts
├── .env.example           # Template — safe to commit
└── .env.local             # Your real keys — never commit
```

---

## 7. First-Time Scaffold (Phase 0)

Only one person does this once, then pushes it. Everyone else uses [Quick Start](#quick-start).

```bash
# From inside the cloned repo
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"
```

Answer **No** to Turbopack if you want the safest default. Then:

```bash
# Core dependencies
npm install @supabase/supabase-js bcryptjs jose
npm install nodemailer            # Gmail SMTP
npm install recharts @tanstack/react-table

# Types
npm install -D @types/bcryptjs @types/nodemailer
```

Then:

1. **Fix the `.gitignore`** — it is currently a Python template. Replace it with the Node/Next.js one (`create-next-app` writes a correct one; keep that) and make sure it contains `.env*.local`, `node_modules/`, `.next/`, and `.vercel`.
2. Create `.env.example` with the variable names from section 3 and **empty values** — commit this one.
3. Add the scripts from section 5 to `package.json`.
4. Verify with `npm run dev`, then commit and push.

---

## 8. Deploying to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo
2. Framework preset is auto-detected as **Next.js** — leave the defaults
3. Add every variable from section 3 under **Settings → Environment Variables**
   - Add them to **Production**, **Preview**, and **Development**
4. Deploy

After that, every push to a branch gets its own **Preview Deployment**, and merges to `main` go to production automatically.

---

## 9. Git Workflow

```bash
git checkout main
git pull
git checkout -b your-name/what-you-are-building

# ...make changes...

npm run lint && npm run typecheck && npm run build   # verify before pushing

git add .
git commit -m "feat: short description of the change"
git push -u origin your-name/what-you-are-building
```

Open a PR against `main`. The Vercel preview URL is posted on the PR — check it before merging.

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| `Module not found: @supabase/supabase-js` | Run `npm install` — dependencies are out of date |
| `Invalid API key` / `Failed to fetch` from Supabase | `.env.local` is missing, misspelled, or has the wrong key. Restart the dev server — Next.js only reads env files at startup |
| Env change has no effect | Stop and restart `npm run dev`. Changes to `.env.local` are **not** hot-reloaded |
| Port 3000 already in use | `npm run dev -- -p 3001` |
| Tailwind classes do nothing | Check the `content` globs in `tailwind.config.ts` actually cover `./src/**/*.{ts,tsx}` |
| Build passes locally, fails on Vercel | Almost always a missing environment variable in the Vercel dashboard, or a case-sensitive import path (Windows is forgiving, Vercel's Linux build is not) |
| Stale or corrupted build | `rm -rf .next node_modules && npm install` (PowerShell: `Remove-Item -Recurse -Force .next, node_modules; npm install`) |

---

## 11. Security Rules for This Repo

- **Never commit** `.env.local`, real keys, or database passwords
- `SUPABASE_SERVICE_ROLE_KEY` bypasses every database rule — server-side only, never in a client component
- Passwords are stored **hashed with bcrypt**, never in plain text
- Every role check happens **on the server**. Hiding a button in the UI is not access control
- Applicant financial data is sensitive — do not paste real records into issues, PRs, or chat
