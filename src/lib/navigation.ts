import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  FileText,
  LayoutDashboard,
  PieChart,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import type { Permission, Role } from '@/lib/auth/roles'
import { canAny } from '@/lib/auth/roles'

/**
 * One navigation definition, rendered three ways.
 *
 * The desktop sidebar, the tablet drawer and the mobile bottom bar all read
 * from this list, so a new section appears in every layout at once and cannot
 * drift between them.
 *
 * `primary: true` marks the items that earn a slot in the mobile bottom nav —
 * there is room for four plus "More", and picking them here rather than in the
 * component keeps the choice reviewable.
 */

export interface NavItem {
  href: string
  label: string
  /** Shorter label for the cramped bottom nav. */
  shortLabel?: string
  icon: LucideIcon
  /** Any one of these permissions grants visibility. Empty = everyone signed in. */
  permissions: readonly Permission[]
  primary?: boolean
  /** Hidden outside development. */
  devOnly?: boolean
  description?: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: LayoutDashboard,
    permissions: [],
    primary: true,
    description: 'What needs your attention today',
  },
  {
    href: '/applications',
    label: 'Applications',
    shortLabel: 'Queue',
    icon: FileText,
    permissions: ['applications:read'],
    primary: true,
    description: 'The decision queue',
  },
  {
    href: '/customers',
    label: 'Customers',
    shortLabel: 'People',
    icon: Wallet,
    permissions: ['customers:read'],
    description: 'The digital-signal profile behind every applicant',
  },
  {
    href: '/portfolio',
    label: 'Portfolio Risk',
    shortLabel: 'Risk',
    icon: PieChart,
    permissions: ['portfolio:read'],
    primary: true,
    description: 'Risk distribution and trends across every customer',
  },
  {
    href: '/monitoring',
    label: 'Monitoring',
    shortLabel: 'Alerts',
    icon: Activity,
    permissions: ['monitoring:read'],
    primary: true,
    description: 'Early-warning signals after disbursement',
  },
  {
    href: '/fraud',
    label: 'FraudSense',
    shortLabel: 'Fraud',
    icon: ShieldAlert,
    permissions: ['fraud:read'],
    description: 'Flagged applicants and the relationship graph',
  },
  {
    href: '/audit',
    label: 'Audit Trail',
    shortLabel: 'Audit',
    icon: ScrollText,
    permissions: ['audit:read'],
    description: 'Every decision, who made it, and when',
  },
  {
    href: '/admin/users',
    label: 'Users & Roles',
    shortLabel: 'Users',
    icon: Users,
    permissions: ['users:manage'],
    description: 'Invite users, assign roles, revoke access',
  },
  {
    href: '/settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
    permissions: [],
    description: 'Your profile and preferences',
  },
  {
    href: '/design-system',
    label: 'Design System',
    shortLabel: 'UI Kit',
    icon: Sparkles,
    permissions: [],
    devOnly: true,
    description: 'Every shared component, in both themes',
  },
]

export function visibleNavItems(role: Role | null | undefined, isDev: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.devOnly && !isDev) return false
    if (item.permissions.length === 0) return true
    return canAny(role, item.permissions)
  })
}

/**
 * The four items that get a slot in the mobile bottom bar, plus whatever is
 * left over for the "More" sheet.
 */
export function splitForBottomNav(items: NavItem[]): { bar: NavItem[]; overflow: NavItem[] } {
  const primary = items.filter((i) => i.primary)
  const bar = (primary.length >= 4 ? primary : [...primary, ...items.filter((i) => !i.primary)]).slice(0, 4)
  const barHrefs = new Set(bar.map((i) => i.href))
  return { bar, overflow: items.filter((i) => !barHrefs.has(i.href)) }
}

/**
 * Whether a nav link should render as the current page.
 *
 * `/applications` must stay highlighted while the user is on
 * `/applications/abc123`, but `/dashboard` must not light up for every route.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}
