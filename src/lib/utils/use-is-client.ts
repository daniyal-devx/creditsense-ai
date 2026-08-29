'use client'

import { useSyncExternalStore } from 'react'

/** A store that never changes — the value differs only between server and client. */
const noopSubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * True once the component has hydrated on the client.
 *
 * Needed by anything that renders into a portal: `document.body` does not
 * exist during server rendering, so the portal has to wait for hydration.
 *
 * The obvious implementation — `useState(false)` plus `useEffect(() => setMounted(true))`
 * — triggers a second render pass on every mount and is exactly the cascading
 * -render pattern React's lint rules reject. `useSyncExternalStore` expresses
 * the same thing as what it actually is: a value read from outside React that
 * differs between the server and the browser.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot)
}
