import { redirect } from 'next/navigation'

/**
 * The root is an entry point, not a page.
 *
 * Phase 2 will send unauthenticated visitors to /login and everyone else to
 * their role's landing path. Until authentication exists there is one
 * destination.
 */
export default function RootPage() {
  redirect('/dashboard')
}
