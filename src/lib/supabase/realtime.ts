'use client'

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase Realtime, used for exactly one thing: pushing new monitoring alerts
 * to an open portfolio view.
 *
 * This is the only place supabase-js appears in the product. Everything else
 * talks to Postgres directly through our own server, because that is where the
 * auth and role checks live. Realtime is the exception because a websocket
 * from the browser is the whole point — proxying it through our server would
 * mean holding a socket open per viewer on a serverless platform that has no
 * way to do that.
 *
 * The security consequence is handled at the schema level: `monitoring_alerts`
 * has RLS enabled with no policies, so the browser-safe publishable key cannot
 * read a single row through this channel. The subscription is a *notification*
 * that something changed; the page then re-fetches through the server, which
 * checks the user's role before returning anything. A viewer never receives
 * applicant data over the socket.
 */

let cached: SupabaseClient | null = null

function browserClient(): SupabaseClient | null {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) return null

  cached = createClient(url, key, {
    auth: {
      // We run our own auth; supabase-js must not try to manage a session,
      // read one from storage, or refresh a token we never issued.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      // Enough for an alert feed; higher rates would just batch anyway.
      params: { eventsPerSecond: 5 },
    },
  })

  return cached
}

export type RealtimeStatus = 'connecting' | 'live' | 'unavailable' | 'error'

export interface AlertSubscription {
  unsubscribe: () => void
}

/**
 * Subscribe to new monitoring alerts.
 *
 * `onChange` fires with no payload on purpose — the caller re-fetches through
 * the server rather than trusting anything that arrived over the socket.
 */
export function subscribeToAlerts(handlers: {
  onChange: () => void
  onStatus?: (status: RealtimeStatus) => void
}): AlertSubscription {
  const client = browserClient()

  if (!client) {
    // No Supabase keys configured. The page still works — it just will not
    // update by itself, and says so.
    handlers.onStatus?.('unavailable')
    return { unsubscribe: () => {} }
  }

  handlers.onStatus?.('connecting')

  let channel: RealtimeChannel

  try {
    channel = client
      .channel('monitoring-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monitoring_alerts' },
        () => handlers.onChange(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') handlers.onStatus?.('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handlers.onStatus?.('error')
        }
      })
  } catch (err) {
    console.error('[realtime] could not subscribe:', err)
    handlers.onStatus?.('error')
    return { unsubscribe: () => {} }
  }

  return {
    unsubscribe: () => {
      try {
        client.removeChannel(channel)
      } catch {
        /* already gone */
      }
    },
  }
}

export function isRealtimeConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}
