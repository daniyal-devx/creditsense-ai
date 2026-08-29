import { AppShell } from '@/components/layout/app-shell'
import { getPlaceholderUser } from '@/lib/auth/placeholder-user'

/**
 * Every signed-in surface renders inside the app shell.
 *
 * PHASE 2 will replace `getPlaceholderUser()` here with the real session
 * lookup and redirect to /login when there is no session.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = getPlaceholderUser()

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      }}
    >
      {children}
    </AppShell>
  )
}
