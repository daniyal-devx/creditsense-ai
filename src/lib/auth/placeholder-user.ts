import type { Role } from './roles'

/**
 * ⚠️  PHASE 0 SCAFFOLD — DELETE IN PHASE 2.
 *
 * The app shell needs a signed-in user to render its navigation, but real
 * authentication (signup, email verification, Google OAuth, sessions) does not
 * land until Phase 2. This stands in until then so the shell can be built and
 * tested at every breakpoint.
 *
 * When Phase 2 lands:
 *   1. Delete this file.
 *   2. Replace `getPlaceholderUser()` in `app/(dashboard)/layout.tsx` with the
 *      real `getSessionUser()`, redirecting to /login when it returns null.
 *   3. `grep -r getPlaceholderUser src/` must come back empty.
 *
 * It logs a warning on every server start so it cannot quietly outlive its
 * purpose. It deliberately does not throw in production — Phase 0 and Phase 1
 * both deploy to Vercel as previews before auth exists, and breaking those
 * deploys would cost more than the reminder is worth.
 */

export interface PlaceholderUser {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl: string | null
}

const PLACEHOLDER: PlaceholderUser = {
  id: 'phase0-placeholder',
  name: 'Demo Administrator',
  email: 'demo@creditsense.local',
  // Admin so every navigation surface is reachable while the shell is being
  // built. Phase 2 replaces this with the real signed-in role.
  role: 'admin',
  avatarUrl: null,
}

let warned = false

export function getPlaceholderUser(): PlaceholderUser {
  if (!warned && typeof window === 'undefined') {
    warned = true
    console.warn(
      '[auth] Using the Phase 0 placeholder user. There is no real authentication yet — ' +
        'every visitor is treated as an administrator. Replaced in Phase 2.',
    )
  }
  return PLACEHOLDER
}

/** True while the app is still running on placeholder auth. Phase 2 removes this. */
export const USING_PLACEHOLDER_AUTH = true
