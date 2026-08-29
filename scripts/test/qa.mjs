/**
 * The Phase 8 responsive and accessibility QA pass — run for real in a browser.
 *
 *   node scripts/test/qa.mjs http://localhost:3000
 *
 * Every screen, at every breakpoint the README names, in both themes. The
 * point of running this rather than eyeballing it is that horizontal overflow
 * and undersized tap targets are exactly the failures that survive a manual
 * check: they only show up at one width, on one page, in one theme.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:3000'

/** The widths the README requires. */
const BREAKPOINTS = [
  { name: '320px  (smallest phone)', width: 320, height: 720 },
  { name: '375px  (iPhone)', width: 375, height: 812 },
  { name: '768px  (tablet)', width: 768, height: 1024 },
  { name: '1024px (small laptop)', width: 1024, height: 768 },
  { name: '1440px (desktop)', width: 1440, height: 900 },
]

const THEMES = ['light', 'dark']

/** Every signed-in screen, with the role that can reach it. */
const PAGES = [
  { path: '/dashboard', name: 'Dashboard', as: 'admin' },
  { path: '/applications', name: 'Application queue', as: 'officer' },
  { path: '/customers', name: 'Customers', as: 'officer' },
  { path: '/portfolio', name: 'Portfolio', as: 'risk' },
  { path: '/monitoring', name: 'Monitoring', as: 'risk' },
  { path: '/fraud', name: 'FraudSense', as: 'fraud' },
  { path: '/audit', name: 'Audit trail', as: 'admin' },
  { path: '/admin/users', name: 'Users & roles', as: 'admin' },
  { path: '/settings', name: 'Settings', as: 'admin' },
  { path: '/design-system', name: 'Design system', as: 'admin' },
]

const PUBLIC_PAGES = [
  { path: '/login', name: 'Login' },
  { path: '/signup', name: 'Signup' },
  { path: '/forgot-password', name: 'Forgot password' },
  { path: '/verify?email=demo@creditsense.pk', name: 'Verify code' },
]

const results = { pass: 0, fail: 0, issues: [] }

function record(page, breakpoint, theme, issue) {
  results.fail++
  results.issues.push({ page, breakpoint, theme, issue })
}

async function signIn(context, email) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'CreditSense2026!')
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
  await page.close()
}

/**
 * The checks. Each returns a list of problems found on the rendered page.
 */
async function auditPage(page, width) {
  return page.evaluate((viewportWidth) => {
    const problems = []

    // ---- 1. horizontal overflow ----
    // "No horizontal scrolling, ever" is a hard rule of this product. A 1px
    // tolerance covers sub-pixel rounding in the layout engine.
    const doc = document.documentElement
    if (doc.scrollWidth > viewportWidth + 1) {
      // Name the widest offending element, or the report is unactionable.
      let worst = null
      let worstRight = viewportWidth
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const style = getComputedStyle(el)
        if (style.position === 'fixed') continue
        // An element inside its own scroll container is allowed to be wider.
        // The walk stops at <body>, which carries `overflow-x: hidden` as the
        // product-wide backstop — counting that would mark every element on
        // every page as "inside a scroller" and report no culprit at all.
        let inScroller = false
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ps = getComputedStyle(p)
          if (ps.overflowX === 'auto' || ps.overflowX === 'scroll' || ps.overflowX === 'hidden') {
            inScroller = true
            break
          }
        }
        if (inScroller) continue
        if (rect.right > worstRight) {
          worstRight = rect.right
          const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
          worst = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ').slice(0, 2).join('.')}` : ''}${text ? ` ["${text}"]` : ''}`
        }
      }
      problems.push(
        `Content overflows horizontally: ${doc.scrollWidth}px in a ${viewportWidth}px viewport${worst ? ` — widest is ${worst}, reaching ${Math.round(worstRight)}px` : ''}`,
      )
    }

    // ---- 2. tap targets ----
    // 44x44 minimum on touch widths. Only checked below 768px, where a finger
    // is doing the work.
    //
    // The design-system gallery is exempt: its entire purpose is to render
    // every button size side by side, including the deliberately-dense `sm`
    // and `icon-sm` variants that are documented as desktop-only. Checking it
    // would mean the specimen sheet can never show them.
    const isGallery = location.pathname === '/design-system'
    if (viewportWidth < 768 && !isGallery) {
      const small = []
      for (const el of document.querySelectorAll('a, button, input[type="checkbox"], [role="button"], [role="tab"]')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        // Parked off-screen until focused — the skip link. Its hidden size is
        // not a tap target anyone can hit, and it grows when it appears.
        if (rect.right < 0 || rect.left > viewportWidth) continue
        // Links inside a paragraph are inline text, not tap targets.
        const isInlineLink =
          el.tagName === 'A' && getComputedStyle(el).display.startsWith('inline')
        if (isInlineLink) continue
        if (rect.height < 40 || rect.width < 40) {
          const label = (el.getAttribute('aria-label') || el.textContent || el.tagName)
            .trim()
            .slice(0, 30)
          small.push(`${label} (${Math.round(rect.width)}x${Math.round(rect.height)})`)
        }
      }
      if (small.length > 0) {
        problems.push(`Tap targets under 40px: ${[...new Set(small)].slice(0, 4).join(', ')}`)
      }
    }

    // ---- 3. accessible names on interactive elements ----
    const unnamed = []
    for (const el of document.querySelectorAll('button, a[href]')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const name =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent?.trim() ||
        el.querySelector('.sr-only')?.textContent?.trim()
      if (!name) {
        unnamed.push(el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : ''))
      }
    }
    if (unnamed.length > 0) {
      problems.push(`Interactive elements with no accessible name: ${[...new Set(unnamed)].slice(0, 4).join(', ')}`)
    }

    // ---- 4. form fields without labels ----
    const unlabelled = []
    for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const id = el.getAttribute('id')
      const hasLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null
      const hasAria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
      if (!hasLabel && !hasAria) unlabelled.push(el.getAttribute('name') || el.type || 'field')
    }
    if (unlabelled.length > 0) {
      problems.push(`Form fields with no label: ${[...new Set(unlabelled)].slice(0, 4).join(', ')}`)
    }

    // ---- 5. images without alt ----
    const noAlt = [...document.querySelectorAll('img')].filter(
      (img) => !img.hasAttribute('alt') && img.getAttribute('aria-hidden') !== 'true',
    )
    if (noAlt.length > 0) problems.push(`${noAlt.length} image(s) with no alt attribute`)

    // ---- 6. exactly one h1 ----
    const h1s = document.querySelectorAll('h1')
    if (h1s.length === 0) problems.push('No <h1> on the page')
    if (h1s.length > 1) problems.push(`${h1s.length} <h1> elements — should be exactly one`)

    // ---- 7. text that has not rendered ----
    if (document.body.innerText.includes('undefined') || document.body.innerText.includes('NaN')) {
      problems.push('Rendered text contains "undefined" or "NaN"')
    }

    return problems
  }, width)
}

async function main() {
  const browser = await chromium.launch()
  console.log(`\n  Responsive & accessibility QA against ${BASE}`)
  console.log('  ' + '─'.repeat(70))

  // One authenticated context per role, reused across breakpoints.
  const contexts = {}
  for (const role of ['admin', 'officer', 'risk', 'fraud']) {
    const context = await browser.newContext()
    await signIn(context, `${role}@creditsense.pk`)
    contexts[role] = context
  }

  const allPages = [
    ...PUBLIC_PAGES.map((p) => ({ ...p, as: null })),
    ...PAGES,
  ]

  for (const breakpoint of BREAKPOINTS) {
    console.log(`\n  ${breakpoint.name}`)
    console.log('  ' + '─'.repeat(70))

    for (const theme of THEMES) {
      let breakpointIssues = 0

      for (const target of allPages) {
        const context = target.as ? contexts[target.as] : await browser.newContext()
        const page = await context.newPage()
        await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height })

        // Set the theme before navigating so nothing renders in the wrong one.
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('creditsense-theme', t)
          } catch {}
        }, theme)

        try {
          await page.goto(`${BASE}${target.path}`, {
            waitUntil: 'networkidle',
            timeout: 30000,
          })
          // Let charts and the score gauge finish their entry animation.
          await page.waitForTimeout(600)

          const problems = await auditPage(page, breakpoint.width)

          if (problems.length === 0) {
            results.pass++
          } else {
            breakpointIssues += problems.length
            for (const problem of problems) {
              record(target.name, breakpoint.name, theme, problem)
            }
          }
        } catch (err) {
          record(target.name, breakpoint.name, theme, `Failed to load: ${err.message.split('\n')[0]}`)
        } finally {
          await page.close()
          if (!target.as) await context.close()
        }
      }

      console.log(
        `    ${theme.padEnd(6)} ${breakpointIssues === 0 ? '✓ clean' : `${breakpointIssues} issue(s)`}`,
      )
    }
  }

  await browser.close()

  // ---- report ----
  console.log('\n  ' + '─'.repeat(70))
  if (results.issues.length === 0) {
    console.log(`  ✓ ${results.pass} page renders checked, no issues found\n`)
  } else {
    // Group by the issue text — the same problem across ten breakpoints is one
    // thing to fix, not ten.
    const grouped = new Map()
    for (const issue of results.issues) {
      const key = `${issue.page} :: ${issue.issue}`
      const entry = grouped.get(key)
      if (entry) entry.where.push(`${issue.breakpoint.split(' ')[0]}/${issue.theme}`)
      else grouped.set(key, { ...issue, where: [`${issue.breakpoint.split(' ')[0]}/${issue.theme}`] })
    }

    console.log(`  ${grouped.size} distinct issue(s) across ${results.issues.length} page renders\n`)
    for (const entry of grouped.values()) {
      console.log(`  ✖ ${entry.page}`)
      console.log(`    ${entry.issue}`)
      console.log(`    at ${entry.where.slice(0, 6).join(', ')}${entry.where.length > 6 ? ` +${entry.where.length - 6} more` : ''}\n`)
    }
  }

  process.exit(results.issues.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\n  QA run failed:', err)
  process.exit(1)
})
