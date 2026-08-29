# CreditSense AI — Tech Stack

A modern, fully serverless stack **deployed entirely on Vercel**. Supabase is used **only for the database (PostgreSQL)** — we build our own auth system and everything else ourselves.

---

## 1. Stack at a Glance

| Layer | Technology | Why We Chose It |
|-------|-----------|-----------------|
| **Frontend / App** | Next.js (App Router) | Full-stack React, SEO-ready, deploy natively on Vercel |
| **Styling** | Tailwind CSS | Fast, utility-first, consistent UI |
| **Language** | TypeScript | Type safety, fewer bugs, better collaboration |
| **Database** | Supabase (PostgreSQL) | Hosted, free to start, scales with us *(used for the database only)* |
| **Auth** | Custom auth (own system) | Full control over roles & permissions, built by us |
| **Social login** | Google OAuth 2.0 | One-click "Continue with Google", no password to manage |
| **Email** | Gmail SMTP + `nodemailer` | Free, zero setup, good enough for verification codes at demo scale |
| **Real-time** | Supabase Realtime | Live portfolio & monitoring updates |
| **File Storage** | Supabase Storage | Store documents, reports, uploads |
| **Deployment** | Vercel | One-command deploy for the whole app |

---

## 2. Why This Stack

### Why Next.js?
- Single app for **both** the user interface and your API routes — no separate backend server to manage.
- Native, first-class deployment on **Vercel**.
- Great performance (static + server rendering, built-in code splitting).

### Why Tailwind CSS?
- Write styles directly in your components — no messy CSS files.
- Consistent design system, dark-mode ready.
- Extremely fast to prototype the hackathon UI.

### Why Supabase?
- **PostgreSQL** database, hosted for you — free tier is plenty for a demo.
- Used **only for the database** — we build our own auth and app logic on top of it.
- Works perfectly with Next.js and can be queried from edge/server functions.
- SQL access whenever we need complex portfolio/risk queries.

### Why build our own Auth (not Supabase Auth)?
- Full control over user **roles** (Loan Officer, Risk Analyst, Fraud Analyst, Admin, End Customer).
- Our auth is tailored to the lending workflow, not a generic login system.
- Can enforce our own rules around applications, approvals, and data access.
- Implementation: sessions stored securely via hashed credentials / JWTs handled in our Next.js API routes.
- Signup is verified by a **6-digit code emailed over Gmail SMTP**; **Continue with Google** skips that step since Google has already verified the address.

### Why Gmail SMTP (and when to move off it)?
- Free and available immediately — no domain verification, no waiting on a provider approval.
- `nodemailer` + a Gmail **App Password** is a few lines of code.
- **Limit:** roughly **500 emails/day**, and deliverability is weaker than a real transactional provider. Swap to one before production — the send interface is abstracted so only the transport changes.

### Why Vercel?
- The app runs 100% on Vercel — frontend, API routes, and server functions.
- Free hosting, automatic HTTPS, instant preview deployments.
- No servers to manage — the whole stack is serverless.

---

## 3. Proposed Architecture Flow

```
        BROWSER (React UI, Tailwind)
                 │
                 ▼
        NEXT.JS APP (on Vercel)
   ┌─────────────┴─────────────┐
   │  UI pages / components    │
   │  API routes (server)      │  ← our custom AUTH lives here
   └─────────────┬─────────────┘
                 │            uses supabase-js / postgREST
                 ▼
        SUPABASE (PostgreSQL database only)
   ┌────────┬────────┬───────────────┐
   │Database │Real-  │ Storage       │
   │(Postgres)│time   │ (files/docs) │
   └────────┴────────┴───────────────┘
```

---

## 4. Key Packages / Libraries (planned)

| Purpose | Package |
|---------|---------|
| App framework | `next` |
| Styling | `tailwindcss` |
| Language | `typescript` |
| Database client | `@supabase/supabase-js` |
| Password hashing | `bcryptjs` |
| Session / tokens | `jose` or `jsonwebtoken` + `cookie` |
| Transactional email | `nodemailer` (Gmail SMTP) |
| Google sign-in | OAuth 2.0 called directly — no NextAuth |
| Charts / graphs | `recharts` |
| Data tables | `@tanstack/react-table` |

> Note: packages will be finalized when we set up the project. Add `npm` / `pnpm` package-lock and scripts as we scaffold.

---

## 5. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

JWT_SECRET=...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
EMAIL_FROM=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Never commit these to git. Use Vercel Environment Variables for the deployed app.
> Full instructions for obtaining each one are in **[SETUP.md](SETUP.md)**.

---

## 6. Deployment (Vercel)

- Connect the GitHub repo to **Vercel** → it auto-builds & deploys on every push.
- No server config needed — the whole app ships as one deploy.
- Use **Preview Deployments** to test before merging.

---

*This stack keeps everything in **one deploy target (Vercel)** and uses **Supabase only as the database** — we build our own auth and application logic ourselves. Minimal moving parts, maximum speed for the hackathon build window.*
