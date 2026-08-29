import Link from 'next/link'
import { LogoMark } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'

/**
 * The signed-out shell.
 *
 * Deliberately not the app shell: there is no navigation to show, and a
 * sidebar full of links a visitor cannot open is noise. On desktop a second
 * column carries the product's argument, because whoever is signing up is
 * usually evaluating the product at the same time. It is hidden below `lg:`
 * rather than stacked — on a phone the only thing that matters is the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* ---------- form column ---------- */}
      <div className="flex min-h-dvh w-full flex-col lg:min-h-0 lg:w-[clamp(26rem,42%,34rem)]">
        <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
          <Link href="/login" className="flex items-center gap-2.5 rounded-lg">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight">CreditSense AI</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 flex-col justify-center px-5 py-6 sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </main>

        <footer className="shrink-0 px-5 py-5 text-center text-xs text-muted-foreground sm:px-8">
          Alibaba Cloud AI Hackathon 2026
        </footer>
      </div>

      {/* ---------- argument column (desktop only) ---------- */}
      <aside
        className="relative hidden flex-1 overflow-hidden bg-surface-sunken lg:block"
        aria-label="About CreditSense AI"
      >
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />

        <div className="relative flex h-full flex-col justify-center px-12 py-16 xl:px-16">
          <div className="max-w-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Financial inclusion, scored
            </p>

            <h2 className="mt-4 text-3xl font-semibold leading-[1.15] tracking-tight xl:text-4xl">
              Millions of creditworthy Pakistanis are invisible to a bank.
            </h2>

            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Freelancers, shopkeepers, drivers and online sellers earn real money every day — it
              just never appears as a payslip. CreditSense reads the digital signals they already
              generate and turns them into a decision a lender can defend.
            </p>

            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-7">
              {[
                { term: 'Can they repay?', desc: 'A 0–1000 score with reasons in plain language.' },
                { term: 'How much is safe?', desc: 'A specific amount, not just a risk rating.' },
                { term: 'Can we trust it?', desc: 'Fraud and relationship-graph checks.' },
                { term: 'What happens after?', desc: 'Early warnings before a default, not after.' },
              ].map((item) => (
                <div key={item.term}>
                  <dt className="text-sm font-semibold">{item.term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-12 border-l-2 border-primary pl-4 text-sm leading-relaxed text-muted-foreground">
              Account ownership in Pakistan rose from roughly 16% in 2015 to about 64% in 2023 — but
              having an account is not the same as being able to borrow.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
