import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Every signed-in surface renders inside the app shell.
 *
 * This is the second of the two auth checks. Middleware already verified the
 * JWT signature and bounced anonymous visitors, but it runs on the Edge and
 * cannot see whether the session row was revoked, or whether the account was
 * suspended a minute ago. `getSessionUser()` checks the row, so a revoked
 * session lands here and is redirected out — even though its cookie still
 * carries a validly signed token.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()

  if (!user) {
    // Middleware normally catches this first. Reaching here means the JWT was
    // fine but the session behind it is gone — revoked, expired server-side,
    // or the account was suspended.
    redirect('/login?error=session_expired')
  }

  return (
    <AppShell
      user={{
        name: user.fullName,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      }}
    >
      {children}
    </AppShell>
  )
}
