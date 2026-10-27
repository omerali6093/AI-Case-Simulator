// End-to-end check of the browser game against the API (dev server or the real backend).
//   node e2e.cjs [null|stub] [baseUrl]
// Needs Playwright with a Chromium. Without internet, three.js is replaced by a stub ('stub') or absent ('null'),
// which exercises all game logic and UI but not real WebGL drawing.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const { spawn } = require('child_process')
const path = require('path')

const mode = process.argv[2] || 'null'
const external = process.argv[3]
const PORT = 4123
const BASE = external || `http://localhost:${PORT}`
const STUB = `(function(){function chain(){var f=function(){return chain()};return new Proxy(f,{get:function(t,k){if(k===Symbol.toPrimitive)return function(){return 0};if(k==='then')return undefined;if(k==='length'||k==='count'||k==='x'||k==='y'||k==='z')return 0;return chain()},set:function(){return true},construct:function(){return chain()},apply:function(){return chain()}})}window.THREE=new Proxy({},{get:function(){return chain()}})})();`

let server
;(async () => {
  if (!external) {
    server = spawn(
      'node',
      [path.join(__dirname, '../backend/dev/memory-server.mjs')],
      { env: { ...process.env, PORT, DATA_FILE: ':memory:' }, stdio: 'ignore' }
    )
    await new Promise(r => setTimeout(r, 700))
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox']
  })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 760 },
    reducedMotion: 'reduce'
  })
  const page = await ctx.newPage()
  const errors = []
  let pass = 0
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      errors.push('console: ' + m.text())
  })
  const submits = { seen: 0, dropFirst: false, fail503: 0 }
  await page.route('**/*', async route => {
    const u = route.request().url()
    if (u.startsWith(BASE)) {
      if (
        u.endsWith('/api/consultations') &&
        route.request().method() === 'POST'
      ) {
        submits.seen++
        if (submits.fail503 > 0) {
          submits.fail503--
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"error":{"message":"Server is busy."}}'
          })
        }
        if (submits.dropFirst) {
          submits.dropFirst = false
          await route.fetch()
          return route.abort()
        } // server saved it, reply lost
      }
      return route.continue()
    }
    if (mode === 'stub' && u.includes('three@0.147.0/build/three.min.js'))
      return route.fulfill({
        contentType: 'application/javascript',
        body: STUB
      })
    if (mode === 'stub' && u.includes('cdn.jsdelivr.net'))
      return route.fulfill({ contentType: 'application/javascript', body: '' })
    return route.abort()
  })
  const must = (cond, msg) => {
    if (!cond) {
      errors.push('ASSERT: ' + msg)
      console.log('FAIL', msg)
    } else {
      pass++
      console.log('ok  ', msg)
    }
  }
  const text = sel => page.textContent(sel)

  async function playInterview () {
    await page.waitForSelector('[data-act="ask"]', { timeout: 20000 })
    for (let i = 0; i < 4; i++) {
      await page.click('[data-act="ask"]')
      await page.waitForSelector(
        i < 3 ? '[data-act="ask"]' : '[data-act="review"]',
        { timeout: 20000 }
      )
    }
    await page.click('[data-act="review"]')
    await page.click('[data-act="toDecide"]')
  }
  async function finish (stepLabelPart) {
    await page.click(`label.opt:has-text("${stepLabelPart}")`)
    await page.click('#confirmBtn')
    await page.waitForSelector('#scoreNum', { timeout: 25000 })
    await page.waitForTimeout(1200)
  }

  await page.goto(BASE + '/')
  await page.waitForFunction(
    () =>
      /saved to your account/.test(
        document.getElementById('authNote').textContent
      ),
    null,
    { timeout: 8000 }
  )
  must(true, 'page detects the server (remote mode)')
  must(await page.locator('#hud').isHidden(), 'game HUD hidden before sign-in')

  // --- sign-in gate: validation and server errors
  await page.click('#authSubmit')
  must(
    (await text('#e-user')).length > 0 && (await text('#e-pass')).length > 0,
    'empty form shows field errors'
  )
  await page.fill('#f-user', 'dr_omer')
  await page.fill('#f-pass', 'password123')
  await page.click('#authSubmit')
  await page.waitForFunction(
    () => document.getElementById('e-form').textContent.length > 0
  )
  must(
    (await text('#e-form')).includes('Invalid username or password'),
    'unknown account is rejected by the server'
  )
  await page.click('#tab-register')
  await page.fill('#f-conf', 'different1')
  await page.click('#authSubmit')
  must((await text('#e-conf')).includes('match'), 'mismatched confirm rejected')
  await page.fill('#f-conf', 'password123')
  await page.click('#authSubmit')
  await page.waitForSelector('#hud:not([hidden])', {
    state: 'attached',
    timeout: 8000
  })
  must(
    (await text('#docName')).includes('dr_omer'),
    'account created and signed in'
  )
  must(
    (await text('#docMeta')).includes('Level 1') &&
      (await text('#docMeta')).includes('0 seen'),
    'HUD shows server progress (0 seen)'
  )

  // --- case 1 played end to end
  await page.waitForFunction(
    () => /blocked nose/.test(document.body.innerText),
    null,
    { timeout: 20000 }
  )
  must(true, 'patient 1 (Sara Khan) speaks her complaint in a bubble')
  must(
    !(await page.evaluate(() => !!document.querySelector('aside, .sidebar'))),
    'no sidebar element exists'
  )
  const caseJson = await page.evaluate(() =>
    JSON.stringify(window.__clinic.state.c)
  )
  must(
    !/points|feedback/.test(caseJson),
    'case data in the browser contains no scoring data'
  )
  await playInterview()
  must(
    await page.locator('#confirmBtn').isDisabled(),
    'confirm disabled until a step is chosen'
  )

  // server unavailable once: the player stays on the choice screen, then succeeds
  submits.fail503 = 3 // every attempt (first try + 2 retries) fails
  await page.click('label.opt:has-text("Self-care")')
  await page.click('#confirmBtn')
  await page.waitForFunction(
    () => /Server is busy/.test(document.getElementById('toast').textContent),
    null,
    { timeout: 8000 }
  )
  must(
    await page.locator('#confirmBtn').isVisible(),
    'after a failed save the choice screen is restored'
  )
  // the reply is lost after the server saved it: the client retries with the same id and is not double-scored
  submits.dropFirst = true
  await page.click('#confirmBtn')
  await page.waitForSelector('#scoreNum', { timeout: 25000 })
  await page.waitForTimeout(1200)
  must((await text('#scoreNum')) === '100', 'result shows server score 100')
  must((await text('#modal')).includes('Strong choice'), 'rating shown')
  await page.click('[data-act="records"]')
  must(
    ((await text('#modal')).match(/Sara Khan/g) || []).length === 1,
    'exactly one record saved despite the retry'
  )
  await page.click('.sheet [data-act="close"] >> nth=-1')
  must(
    (await text('#modal')).includes('Consultation complete'),
    'closing records returns to the result popup'
  )
  await page.click('[data-act="next"]')
  await page.waitForFunction(
    () => /Daniel/.test(document.body.innerText),
    null,
    { timeout: 20000 }
  )
  must(
    (await text('#docMeta')).includes('1 seen'),
    'next patient is case 2 and HUD shows 1 seen'
  )

  // --- case 2: a weaker choice scores lower
  await playInterview()
  await finish('painkillers')
  must(
    (await text('#scoreNum')) === '25',
    'weaker step scores 25 on the server'
  )
  await page.click('[data-act="menu"]').catch(() => {})

  // --- sign out, wrong password, sign back in: progress persisted on the server
  await page.keyboard.press('Escape')
  await page.click('[data-act="next"]')
  await page.waitForSelector('[data-act="menu"]')
  await page.click('[data-act="menu"]')
  await page.click('.sheet [data-act="signout"]')
  await page.waitForSelector('#auth:not([hidden])')
  must(
    await page.locator('#auth').isVisible(),
    'sign out returns to the sign-in screen'
  )
  await page.fill('#f-user', 'dr_omer')
  await page.fill('#f-pass', 'wrong-password1')
  await page.click('#authSubmit')
  await page.waitForFunction(
    () => document.getElementById('e-form').textContent.length > 0
  )
  must((await text('#e-form')).includes('Invalid'), 'wrong password rejected')
  await page.fill('#f-pass', 'password123')
  await page.click('#authSubmit')
  await page.waitForSelector('#hud:not([hidden])', {
    state: 'attached',
    timeout: 8000
  })
  must(
    (await text('#docMeta')).includes('2 seen'),
    'after sign-in again the HUD shows 2 seen (stored on the server)'
  )
  await page.waitForFunction(
    () => /Priya|ankle/.test(document.body.innerText),
    null,
    { timeout: 20000 }
  )
  must(true, 'third patient (Priya Nair) arrives, as the server rotates cases')
  await page.click('[data-act="menu"]')
  await page.click('.sheet [data-act="records"]')
  const rec = await text('#modal')
  must(
    rec.includes('Sara Khan') && rec.includes('Daniel Okafor'),
    'records come back from the server after sign-in'
  )
  await page.keyboard.press('Escape')

  // --- expired session handling
  await ctx.clearCookies()
  await playInterview()
  await page.click('label.opt >> nth=0')
  await page.click('#confirmBtn')
  await page.waitForSelector('#auth:not([hidden])', { timeout: 10000 })
  must(
    (await text('#toast')).includes('session expired'),
    'lost session sends the player back to sign-in with a message'
  )

  // phone width
  await page.setViewportSize({ width: 390, height: 780 })
  await page.waitForTimeout(300)
  must(
    (await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )) <= 1,
    'no horizontal overflow at phone width'
  )

  // --- offline demo: the same page from disk, no server
  const demo = await ctx.newPage()
  demo.on('pageerror', e => errors.push('demo pageerror: ' + e.message))
  await demo.route('**/*', r =>
    r.request().url().startsWith('file://')
      ? r.continue()
      : mode === 'stub' && r.request().url().includes('three.min.js')
      ? r.fulfill({ contentType: 'application/javascript', body: STUB })
      : mode === 'stub' && r.request().url().includes('jsdelivr')
      ? r.fulfill({ contentType: 'application/javascript', body: '' })
      : r.abort()
  )
  await demo.goto('file://' + path.resolve(__dirname, '../frontend/index.html'))
  await demo.waitForFunction(
    () => /Offline demo/.test(document.getElementById('authNote').textContent),
    null,
    { timeout: 8000 }
  )
  must(true, 'opened from disk: falls back to the offline demo')
  await demo.fill('#f-user', 'dr_demo')
  await demo.fill('#f-pass', 'password123')
  await demo.click('#authSubmit')
  await demo.waitForFunction(
    () => /blocked nose/.test(document.body.innerText),
    null,
    { timeout: 20000 }
  )
  must(true, 'offline demo plays the first patient')

  console.log(`\n${pass} checks passed. ERRORS (${errors.length}):`)
  errors.forEach(e => console.log(' -', e.slice(0, 300)))
  await browser.close()
  if (server) server.kill()
  process.exit(errors.length ? 1 : 0)
})().catch(e => {
  console.error('TEST CRASH', e)
  process.exit(2)
})
