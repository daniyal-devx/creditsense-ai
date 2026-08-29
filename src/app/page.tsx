import { redirect } from 'next/navigation'
import { landingPathFor } from '@/lib/auth/roles'
import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * The root is an entry point, not a page.
 *
 * Signed-in users go straight to whatever their role's home is — a Fraud
 * Analyst should land on the fraud queue, not on a dashboard they have to
 * navigate away from every morning.
 */
export default async function RootPage() {
  const user = await getSessionUser()
  redirect(user ? landingPathFor(user.role) : '/login')
}
