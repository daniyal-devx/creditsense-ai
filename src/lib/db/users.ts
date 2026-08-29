import 'server-only'
import { query, queryOne } from './client'
import { recordAudit } from '@/lib/auth/audit'
import { revokeAllSessions } from '@/lib/auth/session'
import type { Role } from '@/lib/auth/roles'

/** Reads and writes for the admin user-management surface. */

export interface ManagedUser {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  role: Role
  status: 'unverified' | 'active' | 'suspended'
  authProviders: string[]
  emailVerifiedAt: Date | null
  lastLoginAt: Date | null
  createdAt: Date
  activeSessions: number
}

export async function listUsers(): Promise<ManagedUser[]> {
  const rows = await query<Record<string, unknown>>(
    `select
       u.id, u.email, u.full_name, u.avatar_url, u.role, u.status,
       u.auth_providers, u.email_verified_at, u.last_login_at, u.created_at,
       (select count(*) from sessions s
         where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()
       )::text as active_sessions
     from users u
     order by
       -- Anything needing attention first: unverified accounts, then
       -- suspended ones, then everyone else by recency.
       case u.status when 'unverified' then 0 when 'suspended' then 1 else 2 end,
       u.created_at desc`,
  )

  return rows.map((r) => ({
    id: r.id as string,
    email: r.email as string,
    fullName: r.full_name as string,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    role: r.role as Role,
    status: r.status as ManagedUser['status'],
    authProviders: (r.auth_providers as string[]) ?? [],
    emailVerifiedAt: (r.email_verified_at as Date | null) ?? null,
    lastLoginAt: (r.last_login_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
    activeSessions: Number(r.active_sessions ?? 0),
  }))
}

export async function getUserById(id: string): Promise<ManagedUser | null> {
  const rows = await query<Record<string, unknown>>(
    `select u.id, u.email, u.full_name, u.avatar_url, u.role, u.status,
            u.auth_providers, u.email_verified_at, u.last_login_at, u.created_at,
            0::text as active_sessions
       from users u where u.id = $1`,
    [id],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id as string,
    email: r.email as string,
    fullName: r.full_name as string,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    role: r.role as Role,
    status: r.status as ManagedUser['status'],
    authProviders: (r.auth_providers as string[]) ?? [],
    emailVerifiedAt: (r.email_verified_at as Date | null) ?? null,
    lastLoginAt: (r.last_login_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
    activeSessions: 0,
  }
}

export interface AdminActor {
  id: string
  email: string
  role: Role
}

export type AdminResult = { ok: true } | { ok: false; error: string }

/**
 * Change a user's role.
 *
 * Every existing session is revoked. A role is baked into the session JWT, so
 * without this a demoted user would keep their old permissions until their
 * token expired — up to seven days of access they should no longer have.
 */
export async function changeUserRole(
  targetUserId: string,
  newRole: Role,
  actor: AdminActor,
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<AdminResult> {
  const target = await queryOne<{ role: Role; email: string }>(
    'select role, email from users where id = $1',
    [targetUserId],
  )
  if (!target) return { ok: false, error: 'That user no longer exists.' }
  if (target.role === newRole) return { ok: true }

  // Never let the last administrator remove their own admin rights — that
  // locks the whole organisation out of user management with no way back in.
  if (target.role === 'admin' && newRole !== 'admin') {
    const remaining = await queryOne<{ count: string }>(
      `select count(*)::text as count from users
        where role = 'admin' and status = 'active' and id <> $1`,
      [targetUserId],
    )
    if (Number(remaining?.count ?? 0) === 0) {
      return {
        ok: false,
        error: 'This is the only active administrator. Promote someone else first.',
      }
    }
  }

  await query('update users set role = $2 where id = $1', [targetUserId, newRole])
  await revokeAllSessions(targetUserId)

  await recordAudit({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'user.role_changed',
    entityType: 'user',
    entityId: targetUserId,
    details: { from: target.role, to: newRole, targetEmail: target.email, sessionsRevoked: true },
    ...ctx,
  })

  return { ok: true }
}

/** Suspend a user: immediate, and every live session dies with it. */
export async function suspendUser(
  targetUserId: string,
  actor: AdminActor,
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<AdminResult> {
  if (targetUserId === actor.id) {
    return { ok: false, error: 'You cannot suspend your own account.' }
  }

  const target = await queryOne<{ role: Role; email: string; status: string }>(
    'select role, email, status from users where id = $1',
    [targetUserId],
  )
  if (!target) return { ok: false, error: 'That user no longer exists.' }
  if (target.status === 'unverified') {
    return { ok: false, error: 'That account has not been verified yet, so it cannot sign in.' }
  }

  if (target.role === 'admin') {
    const remaining = await queryOne<{ count: string }>(
      `select count(*)::text as count from users
        where role = 'admin' and status = 'active' and id <> $1`,
      [targetUserId],
    )
    if (Number(remaining?.count ?? 0) === 0) {
      return { ok: false, error: 'This is the only active administrator.' }
    }
  }

  await query(`update users set status = 'suspended' where id = $1`, [targetUserId])
  await revokeAllSessions(targetUserId)

  await recordAudit({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'user.suspended',
    entityType: 'user',
    entityId: targetUserId,
    details: { targetEmail: target.email, sessionsRevoked: true },
    ...ctx,
  })

  return { ok: true }
}

export async function reactivateUser(
  targetUserId: string,
  actor: AdminActor,
  ctx: { ipAddress: string | null; userAgent: string | null },
): Promise<AdminResult> {
  const target = await queryOne<{ email: string; email_verified_at: Date | null }>(
    'select email, email_verified_at from users where id = $1',
    [targetUserId],
  )
  if (!target) return { ok: false, error: 'That user no longer exists.' }

  // A never-verified account cannot be moved straight to active — the status
  // CHECK constraint requires a verification timestamp, and more importantly
  // we would be asserting an address was confirmed when it never was.
  if (!target.email_verified_at) {
    return {
      ok: false,
      error: 'That account has never verified its email address. Ask them to complete signup.',
    }
  }

  await query(`update users set status = 'active' where id = $1`, [targetUserId])

  await recordAudit({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'user.reactivated',
    entityType: 'user',
    entityId: targetUserId,
    details: { targetEmail: target.email },
    ...ctx,
  })

  return { ok: true }
}

export interface UserStats {
  total: number
  active: number
  unverified: number
  suspended: number
  byRole: Record<string, number>
}

export async function getUserStats(): Promise<UserStats> {
  const rows = await query<{ role: string; status: string; count: string }>(
    'select role, status, count(*)::text as count from users group by role, status',
  )

  const stats: UserStats = { total: 0, active: 0, unverified: 0, suspended: 0, byRole: {} }

  for (const row of rows) {
    const count = Number(row.count)
    stats.total += count
    if (row.status === 'active') stats.active += count
    if (row.status === 'unverified') stats.unverified += count
    if (row.status === 'suspended') stats.suspended += count
    stats.byRole[row.role] = (stats.byRole[row.role] ?? 0) + count
  }

  return stats
}
