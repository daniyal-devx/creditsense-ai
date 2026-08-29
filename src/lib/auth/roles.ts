/**
 * Roles and permissions.
 *
 * Defined in Phase 0 because the app shell needs to know which navigation a
 * role can see; enforced for real on the server in Phase 2. Two rules this
 * file exists to keep honest:
 *
 *   1. Permissions are the unit of authorisation, never roles. Code asks
 *      `can(role, 'applications:decide')`, never `role === 'admin'`. Adding a
 *      role later then means editing one table instead of hunting for
 *      comparisons scattered across the codebase.
 *
 *   2. This module is pure data. Hiding a nav item is a convenience, not
 *      access control — every data path re-checks on the server.
 *
 * The End Customer is deliberately absent. They never log into this dashboard;
 * they interact through the lender's own app.
 */

export const ROLES = ['loan_officer', 'risk_analyst', 'fraud_analyst', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'applications:read',
  'applications:decide',
  'portfolio:read',
  'monitoring:read',
  'fraud:read',
  'fraud:investigate',
  'customers:read',
  'audit:read',
  'users:manage',
  'settings:manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export interface RoleDefinition {
  id: Role
  label: string
  /** One sentence describing what this role is for, shown in the admin UI. */
  description: string
  permissions: readonly Permission[]
  /** Where this role lands after logging in. */
  landingPath: string
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  loan_officer: {
    id: 'loan_officer',
    label: 'Loan Officer',
    description:
      'Reviews applications with their score, affordability and fraud flags, then approves, rejects, or sends to manual review.',
    permissions: [
      'applications:read',
      'applications:decide',
      'customers:read',
      'monitoring:read',
      'fraud:read',
    ],
    landingPath: '/applications',
  },
  risk_analyst: {
    id: 'risk_analyst',
    label: 'Risk Analyst',
    description:
      'Watches portfolio-level risk distribution, trends and early-warning signals across every customer.',
    permissions: [
      'applications:read',
      'portfolio:read',
      'monitoring:read',
      'customers:read',
      'fraud:read',
    ],
    landingPath: '/portfolio',
  },
  fraud_analyst: {
    id: 'fraud_analyst',
    label: 'Fraud Analyst',
    description:
      'Investigates flagged applicants and traces suspicious clusters through the relationship graph.',
    permissions: ['fraud:read', 'fraud:investigate', 'applications:read', 'customers:read'],
    landingPath: '/fraud',
  },
  admin: {
    id: 'admin',
    label: 'Administrator',
    description: 'Manages users, roles and system configuration, and can see the full audit trail.',
    permissions: [...PERMISSIONS],
    landingPath: '/dashboard',
  },
}

const PERMISSION_SETS: Record<Role, Set<Permission>> = Object.fromEntries(
  ROLES.map((role) => [role, new Set(ROLE_DEFINITIONS[role].permissions)]),
) as Record<Role, Set<Permission>>

/** The single authorisation question the rest of the codebase asks. */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return PERMISSION_SETS[role]?.has(permission) ?? false
}

/** True if the role has every one of the listed permissions. */
export function canAll(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p))
}

/** True if the role has at least one of the listed permissions. */
export function canAny(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p))
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function roleLabel(role: Role | null | undefined): string {
  return role ? ROLE_DEFINITIONS[role].label : 'Unknown role'
}

/** Where to send a user immediately after a successful login. */
export function landingPathFor(role: Role): string {
  return ROLE_DEFINITIONS[role].landingPath
}
