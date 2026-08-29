# CreditSense AI

**AI-powered credit risk & financial inclusion platform for Pakistan — Alibaba Cloud AI Hackathon 2026**

Millions of creditworthy Pakistanis are locked out of credit because they have no "paper trail" a traditional bank can read. CreditSense AI turns the digital signals they already generate — wallet transactions, mobile top-ups, utility bill payments — into a trusted, explainable credit decision.

📄 **[Problem Statement](document/README.md)** · 🛠 **[Tech Stack](document/TECH_STACK.md)** · ⚙️ **[Setup & Local Development](document/SETUP.md)**

---

## Build Phases

Every phase maps back to a specific part of the problem. We build **bottom-up**: signals → score → affordability → trust → monitoring → the screens each role actually uses.

| # | Phase | Answers / Enables | Status |
|---|-------|-------------------|--------|
| 0 | Foundation & Project Setup | Nothing works without it | ✅ Done |
| 1 | Digital Signal Data Layer | *"What can we even see about this person?"* | ⬜ Not started |
| 2 | Auth, Email & Access Control | Signup, email verification, Google sign-in, roles | ⬜ Not started |
| 3 | CreditSense Score | **Q1 — Can this person repay?** | ⬜ Not started |
| 4 | Financial Affordability Engine | **Q2 — How much can they safely borrow?** | ⬜ Not started |
| 5 | FraudSense (Fraud & Network Risk) | **Q3 — Can we trust this application?** | ⬜ Not started |
| 6 | Continuous Financial Monitoring | **Q4 — What happens after the loan is given?** | ⬜ Not started |
| 7 | Role Dashboards & Decision Workflow | Turns scores into an actual approve/reject | ⬜ Not started |
| 8 | Demo Data, Polish & Deploy | Makes it provable to judges & lenders | ⬜ Not started |

---

## UI & Experience Standards

**These are not a phase — they apply to every screen we build, from Phase 0 onward.** A loan officer decides someone's financial future on these screens. If the interface is confusing, the model being accurate does not matter.

### Non-negotiables

| Rule | What it means in practice |
|------|---------------------------|
| **Mobile responsive, always** | Every screen works from **320px** to ultrawide. A loan officer in the field opens this on a phone. No horizontal scrolling, ever. |
| **Mobile-first, not desktop-shrunk** | Build the small layout first, then expand. Tailwind breakpoints are `sm:` `md:` `lg:` `xl:` — the base class is the phone. |
| **Touch-friendly** | Minimum **44×44px** tap targets. No hover-only actions — anything reachable by hover must also be reachable by tap. |
| **Plain language over jargon** | "Likely to repay" beats "PD = 0.08". The model explains itself in sentences a customer could understand. |
| **Never a blank screen** | Every view has designed **loading**, **empty**, **error**, and **no-permission** states. Skeletons, not spinners, for content. |
| **Accessible by default** | WCAG AA contrast, full keyboard navigation, visible focus rings, semantic HTML, labelled form fields, ARIA where needed. |
| **Fast is a feature** | Skeleton loaders on first paint, optimistic UI on actions, no layout shift when data arrives. |
| **Dark mode from day one** | Built into the token system, not retrofitted later. |

### Design language

- **Calm, professional, financial** — this is a lending tool, not a consumer app. Restrained colour, generous whitespace, strong typographic hierarchy.
- **Colour carries meaning, and never alone.** Risk bands use green / amber / red **plus** a label and an icon, so the meaning survives colour blindness and greyscale printing.
- **One consistent component library.** Buttons, inputs, cards, tables, badges, modals, and toasts are built once in Phase 0 and reused everywhere. No one-off styling.
- **Data density scales with the screen.** Desktop shows the full table; mobile shows a prioritised card with the three things that actually drive the decision.

### Responsive layout targets

| Breakpoint | Layout |
|------------|--------|
| **Mobile** (< 640px) | Single column, bottom nav or drawer, tables become stacked cards, charts simplified |
| **Tablet** (640–1024px) | Two columns, collapsible sidebar, scrollable tables with sticky first column |
| **Desktop** (> 1024px) | Full sidebar, multi-column dashboards, complete data tables and graphs |

---

## Phase 0 — Foundation & Project Setup

**Goal:** A deployable skeleton on day one, so nothing is blocked on infrastructure later.

- Scaffold Next.js (App Router) + TypeScript + Tailwind CSS
- Create the Supabase project (PostgreSQL only — no Supabase Auth)
- Wire environment variables locally and in Vercel
- Connect the repo to Vercel with preview deployments on every push

**Build the design system here — everything later depends on it:**

- Design tokens in Tailwind config: colour scale, risk-band colours, spacing, radii, typography scale
- Light and dark themes wired through CSS variables
- Responsive app shell: sidebar on desktop → drawer on tablet → bottom nav on mobile
- Shared UI primitives, each responsive and accessible from the start:
  `Button` · `Input` · `Select` · `Card` · `Badge` · `Modal` · `Toast` · `Tabs` · `DataTable` · `Skeleton` · `EmptyState` · `ErrorState`
- Standard page layout with breadcrumb, page title, and action slot

**Done when:** an empty but live app is reachable on a Vercel URL, can query the database, and the component set renders correctly on a 320px phone and a 1440px desktop in both themes.

---

## Phase 1 — Digital Signal Data Layer

**Solves:** *"Real people, real money — but no way for a lender to see it."*

This is the foundation of the entire product. If the signals are not modelled well, no downstream module can work.

- Design the schema: `customers`, `applications`, `wallet_transactions`, `topups`, `bill_payments`, `loans`, `repayments`
- Build ingestion for the alternative-data signals:
  - Mobile wallet transactions (JazzCash, EasyPaisa, Raast)
  - Mobile top-up payments
  - Utility bill payments
- Build the **feature engineering layer** — turn raw transactions into signals a model can use:
  - Income regularity & volatility
  - Cash-in vs. cash-out patterns
  - Bill payment punctuality / missed-payment streaks
  - Account tenure and activity density
- Seed realistic synthetic data for the Pakistani informal-worker personas (freelancer, shopkeeper, driver, online seller)

**Done when:** a thin-file applicant with zero bank loan history has a rich, queryable behavioural profile.

---

## Phase 2 — Auth, Email & Access Control

**Solves:** the five distinct roles in the problem statement — each sees a different slice of the system — and gets real people onto the platform securely.

Built entirely ourselves in Next.js API routes. **No Supabase Auth, no NextAuth** — full control over the lending-specific role model.

### 2.1 — Signup with Email Verification

The default path: email + password, verified by a code sent to the user's inbox.

```
   SIGNUP FORM                    EMAIL INBOX              APP
   name, email, password
          │
          ▼
   Validate + hash password
   (bcrypt, 12 rounds)
          │
          ▼
   Create user  →  status: UNVERIFIED
          │
          ▼
   Generate 6-digit code  ──────►  "Your CreditSense
   (hashed, 10-min expiry)         code is 482915"
                                          │
                                          ▼
                                   User enters code
                                          │
                                          ▼
                                   Code verified  ──►  status: ACTIVE
                                                       session issued
                                                       redirect to dashboard
```

- Email + password signup with strength requirements and live validation
- Passwords hashed with **bcrypt (12 rounds)** — never stored or logged in plain text
- **6-digit verification code** emailed on signup, stored **hashed** with a **10-minute expiry**
- Code entry screen with auto-advancing digit inputs and paste support
- **Resend code** with a 60-second cooldown, and a cap of 5 attempts per code before invalidation
- Unverified accounts cannot log in and cannot reach any dashboard route
- Expired and used codes are cleaned up on a schedule

### 2.2 — Continue with Google

One-click signup and login via Google OAuth 2.0, implemented directly against Google's endpoints.

- **"Continue with Google"** button on both the login and signup screens
- Standard OAuth 2.0 authorization-code flow with **PKCE** and a `state` parameter for CSRF protection
- Google-verified emails **skip the code step entirely** — Google has already verified them
- **Account linking:** if the Google email matches an existing verified account, link the provider instead of creating a duplicate
- Profile name and avatar pulled from the Google profile on first sign-in
- Setup: Google Cloud Console → **OAuth consent screen** → **Credentials** → authorized redirect URI `/api/auth/google/callback` (one for `localhost:3000`, one for the Vercel domain)

### 2.3 — Email System (Gmail SMTP)

All transactional email goes out over **Gmail SMTP** via `nodemailer`.

| Setting | Value |
|---------|-------|
| Host | `smtp.gmail.com` |
| Port | `587` (STARTTLS) — or `465` for SSL |
| Auth | Gmail address + **App Password** |

- Gmail **App Password** required — this needs 2-Step Verification enabled on the sending account. A normal Gmail password will not work.
- Credentials live in server-side env vars only, never `NEXT_PUBLIC_`
- Reusable, responsive **HTML email templates** that render correctly in Gmail, Outlook, and on mobile, each with a plain-text fallback
- Emails to build:
  - **Verification code** — signup
  - **Welcome** — after successful verification
  - **Password reset code** — forgot-password flow
  - **New login alert** — sign-in from a new device
- Sending is queued and retried on failure; a failed email never blocks or breaks the signup transaction
- **Known limit:** Gmail SMTP caps at roughly **500 emails/day**. Fine for the hackathon and pilot; swap in a transactional provider before real scale.

### 2.4 — Sessions & Password Management

- **JWT sessions** signed with `jose`, stored in **httpOnly, Secure, SameSite** cookies
- Short-lived access token with refresh, and a working **logout** that actually invalidates the session
- **Forgot password** → emailed reset code → set new password → all existing sessions invalidated
- Rate limiting on login, signup, code verification, and resend, to block brute force and email flooding

### 2.5 — Roles & Access Control

- Role model: **Loan Officer · Risk Analyst · Fraud Analyst · Administrator**
- Route protection in middleware plus **server-side permission checks on every data access** — hiding a button is not access control
- Admin surface for inviting users, assigning roles, and revoking access
- Audit trail on every decision (who approved or rejected what, and when)

> The **End Customer** never logs in here — they interact only through the lender's own app. This dashboard is for the lender.

### Screens for this phase

Signup · Verify code · Login · Forgot password · Reset password · Check your email · Profile & password settings · Admin user management

All of them mobile-first per the [UI standards](#ui--experience-standards) — the verification code input in particular has to work with a phone keyboard and with SMS/email autofill.

**Done when:** a new user can sign up with email, receive a real code in their inbox, verify, and land on their dashboard — **or** skip all of it with "Continue with Google" — and each role sees only what their role is allowed to see.

---

## Phase 3 — CreditSense Score  *(Q1: Can this person repay?)*

**Solves:** the thin-file problem itself.

- Train and serve a risk model over the Phase 1 features → **repayment probability**
- Map probability to a **0–1000 CreditSense Score** with clear risk bands
- Build the **explainability layer** — top contributing factors in plain language, not model jargon
  - *"Pays utility bills on time 11 of the last 12 months (+)"*
  - *"Income dropped 40% in the last 60 days (−)"*
**UI for this phase:**

- **Score gauge** — the 0–1000 score as the single most prominent element on the applicant view, with its risk band as a coloured, labelled badge beside it
- **Reason cards** — each contributing factor as a readable sentence with a clear positive / negative indicator, ranked by impact
- On mobile the score and band stay above the fold; reasons stack beneath in a scrollable list

**Done when:** an applicant with no credit history gets a defensible score a loan officer can read out loud and justify — on a phone, without pinching or scrolling sideways.

---

## Phase 4 — Financial Affordability Engine  *(Q2: How much can they safely borrow?)*

**Solves:** *"Bank cannot judge ability to repay."* A score alone does not size a loan.

- Estimate disposable income from inflow / outflow behaviour
- Compute a safe loan ceiling and a recommended instalment
- Debt-service-to-income style stress checks against income volatility
- Recommend loan amount, tenure, and instalment — with the reasoning shown

**Done when:** the platform proposes a **specific, defensible loan amount**, not just a risk rating.

---

## Phase 5 — FraudSense  *(Q3: Can we trust this application?)*

**Solves:** *"Fraud slips through the cracks."*

- Anomaly detection on transaction behaviour (velocity spikes, circular transfers, synthetic activity patterns)
- Identity and application-consistency checks
- **Relationship graph** linking applicants by shared devices, numbers, addresses, and counterparties
- Cluster detection to surface coordinated / ring fraud
- Fraud risk flags surfaced directly on the application, plus a dedicated investigation view

**Done when:** a Fraud Analyst can open a flagged applicant and visually trace the suspicious cluster around them.

---

## Phase 6 — Continuous Financial Monitoring  *(Q4: What happens after the loan?)*

**Solves:** *"No way to track a loan after approval."* Scoring is not a one-time event.

- Re-score approved customers on an ongoing basis as new signals arrive
- **Early-warning signals:** income collapse, missed bill payments, wallet dormancy, score deterioration
- Alerts pushed live to the portfolio view via Supabase Realtime
- Portfolio-level trends and risk migration over time

**Done when:** a customer whose behaviour deteriorates after disbursement triggers an alert *before* they default.

---

## Phase 7 — Role Dashboards & Decision Workflow

**Solves:** turning four modules into one decision — *"lender approves with confidence."*

| Role | Screen |
|------|--------|
| **Loan Officer** | Application queue → full applicant view (score + affordability + fraud flags + explanations) → **approve / reject / send to manual review** |
| **Risk Analyst** | Portfolio risk distribution, trends, early-warning feed across all customers |
| **Fraud Analyst** | Flagged-applicant queue and interactive relationship graph |
| **Administrator** | User management, permissions, system configuration |

- Tables via `@tanstack/react-table`, charts via `recharts`
- Decisions written back with full reasoning captured for audit

**Responsive behaviour — this is where it matters most:**

| Element | Desktop | Mobile |
|---------|---------|--------|
| **Application queue** | Full sortable, filterable table | Stacked cards: name, score, risk band, fraud flag |
| **Applicant view** | Side-by-side panels (score · affordability · fraud · history) | Tabbed sections, one panel at a time |
| **Approve / reject** | Inline action bar | Sticky bottom action bar, always in thumb reach |
| **Portfolio charts** | Full multi-series charts | Simplified single-metric charts, swipeable |
| **Relationship graph** | Interactive pan / zoom canvas | Pinch-zoom canvas with a tap-to-inspect node list fallback |
| **Navigation** | Persistent sidebar | Bottom nav + slide-over drawer |

**Done when:** the complete journey — applicant in, decision out — runs end to end in the UI, and a loan officer can approve a real application start to finish on a phone.

---

## Phase 8 — Demo Data, Polish & Deploy

**Goal:** make the impact undeniable in a short demo.

- Curated demo personas that tell the story: the freelancer a bank rejects but CreditSense approves; the fraud ring; the post-loan deterioration case
- **Full responsive QA pass** — every screen checked at 320px, 375px, 768px, 1024px, and 1440px, in both light and dark mode
- **Accessibility pass** — keyboard-only walkthrough of the approve/reject flow, contrast audit, screen-reader labels on every interactive element
- Micro-interactions: transitions, hover and focus states, toast confirmations on every action
- Performance pass — Lighthouse **90+** on Performance and Accessibility on mobile
- Production deploy on Vercel
- Demo script walking the four questions in order

**Done when:** the full narrative can be shown in under five minutes with nothing left to the imagination — and it looks just as good demoed from a phone as from a laptop.

---

## Phase Dependencies

```
        Phase 0  Foundation
              │
              ▼
        Phase 1  Digital Signal Data Layer
              │
              ├──────────────┐
              ▼              ▼
        Phase 2  Auth   Phase 3  CreditSense Score
              │              │
              │      ┌───────┼───────┐
              │      ▼       ▼       ▼
              │  Phase 4  Phase 5  Phase 6
              │  Afford.  Fraud    Monitoring
              │      │       │       │
              └──────┴───┬───┴───────┘
                         ▼
              Phase 7  Role Dashboards
                         │
                         ▼
              Phase 8  Demo & Deploy
```

Phases 4, 5 and 6 are independent of each other — once the score exists, they can be built in parallel.

---

## The Bottom Line

CreditSense AI gives lenders the ability to **say "yes" with confidence** to millions of hardworking Pakistanis currently locked out of credit — while protecting the lender from risk and fraud. It turns financial *behavior* into **trusted credit**.
