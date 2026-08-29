/**
 * Performance measurement on a throttled mobile connection.
 *
 *   node scripts/test/perf.mjs http://localhost:3000
 *
 * Not a Lighthouse substitute — it measures the things that actually decide
 * whether a loan officer on a phone in a shop can use this: how long until
 * they see content, how much they had to download to get it, and whether the
 * layout moved under their thumb after it arrived.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:3000'

const PAGES = [
  { path: '/login', name: 'Login', auth: false },
  { path: '/dashboard', name: 'Dashboard', auth: true },
  { path: '/applications', name: 'Application queue', auth: true },
  { path: '/customers', name: 'Customers', auth: true },
  { path: '/portfolio', name: 'Portfolio', auth: true },
  { path: '/monitoring', name: 'Monitoring', auth: true },
]

/** Roughly a good 4G connection on a mid-range Android. */
const NETWORK = {
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1 * 1024 * 1024) / 8,
  latency: 80,
}
const CPU_SLOWDOWN = 4

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  })

  // Sign in once and reuse the session.
  const setup = await context.newPage()
  await setup.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await setup.fill('input[type="email"]', 'officer@creditsense.pk')
  await setup.fill('input[type="password"]', 'CreditSense2026!')
  await setup.click('button[type="submit"]')
  await setup.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
  await setup.close()

  console.log(`\n  Mobile performance — 375px, 4G, ${CPU_SLOWDOWN}x CPU slowdown`)
  console.log('  ' + '─'.repeat(72))
  console.log(
    `  ${'Page'.padEnd(20)} ${'FCP'.padStart(8)} ${'Loaded'.padStart(8)} ${'Transfer'.padStart(10)} ${'CLS'.padStart(7)}  Requests`,
  )
  console.log('  ' + '─'.repeat(72))

  const results = []

  for (const target of PAGES) {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', { offline: false, ...NETWORK })
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })

    let transferred = 0
    let requests = 0
    page.on('response', async (res) => {
      requests++
      try {
        const length = res.headers()['content-length']
        if (length) transferred += Number(length)
        else transferred += (await res.body().catch(() => Buffer.alloc(0))).length
      } catch {
        /* a redirect or a cached response with no body */
      }
    })

    // Cumulative layout shift, observed for the life of the page.
    await page.addInitScript(() => {
      window.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__cls += entry.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })

    const started = Date.now()
    await page.goto(`${BASE}${target.path}`, { waitUntil: 'load', timeout: 60000 })
    const loaded = Date.now() - started

    // Let charts and animations settle so any late shift is counted.
    await page.waitForTimeout(1500)

    const metrics = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]
      return {
        fcp: fcp ? Math.round(fcp.startTime) : null,
        cls: Math.round((window.__cls ?? 0) * 1000) / 1000,
      }
    })

    results.push({ ...target, ...metrics, loaded, transferred, requests })

    console.log(
      `  ${target.name.padEnd(20)} ${String(metrics.fcp ?? '—').padStart(6)}ms ` +
        `${String(loaded).padStart(6)}ms ${(transferred / 1024).toFixed(0).padStart(8)}kB ` +
        `${String(metrics.cls).padStart(7)}  ${requests}`,
    )

    await page.close()
  }

  await browser.close()

  console.log('  ' + '─'.repeat(72))

  // ---- verdict ----
  // Thresholds are the Core Web Vitals "good" boundaries, plus a payload
  // budget that keeps a page usable on a slow connection.
  const problems = []
  for (const r of results) {
    if (r.fcp !== null && r.fcp > 1800) {
      problems.push(`${r.name}: first paint at ${r.fcp}ms (good is under 1800ms)`)
    }
    if (r.cls > 0.1) {
      problems.push(`${r.name}: layout shift ${r.cls} (good is under 0.1)`)
    }
    if (r.transferred / 1024 > 1200) {
      problems.push(`${r.name}: ${(r.transferred / 1024).toFixed(0)}kB transferred`)
    }
  }

  const avgFcp = Math.round(
    results.filter((r) => r.fcp !== null).reduce((s, r) => s + r.fcp, 0) /
      results.filter((r) => r.fcp !== null).length,
  )
  const worstCls = Math.max(...results.map((r) => r.cls))
  const avgKb = Math.round(results.reduce((s, r) => s + r.transferred, 0) / results.length / 1024)

  console.log(`\n  Average first paint   ${avgFcp}ms   (good < 1800ms)`)
  console.log(`  Worst layout shift    ${worstCls}      (good < 0.1)`)
  console.log(`  Average transfer      ${avgKb}kB`)

  if (problems.length === 0) {
    console.log('\n  ✓ Every page is within the Core Web Vitals "good" thresholds on 4G.\n')
  } else {
    console.log('')
    for (const p of problems) console.log(`  ⚠ ${p}`)
    console.log('')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('\n  Performance run failed:', err)
  process.exit(1)
})
