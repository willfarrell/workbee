import { test, expect } from '@playwright/test'

const localhost = '/index.html'

test('Should register ServiceWorker', async ({ browser }) => {
  const context = await browser.newContext()

  await context.route('/test', async (route) => {
    if (route.request().serviceWorker()) {
      return route.fulfill({
        contentType: 'text/plain',
        status: 200,
        body: 'OK'
      })
    } else {
      return route.continue()
    }
  })

  const page = await context.newPage()
  await page.goto(localhost)
  await page.evaluate(async () => {
    const registration = await window.navigator.serviceWorker.getRegistration()
    if (registration.active?.state === 'activated') {
      return
    }
    await new Promise((resolve) =>
      window.navigator.serviceWorker.addEventListener(
        'controllerchange',
        resolve
      )
    )
  })

  await expect(page).toHaveTitle(/workbee/)

  let res
  page.on('response', (response) => {
    res = response
  })

  await page.evaluate(() => fetch('/test'))
  await expect(await res.text()).toBe('OK')
  await expect(res.fromServiceWorker()).toBe(true)
  await context.close()
})

// test precache
/*
test('Should use strategyStaleWhileRevalidate from precache', async ({
  browser
}) => {
  const browserContext = await browser.newContext()
  const page = await browserContext.newPage()

  let requests = []
  browserContext.on('request', async (request) =>
    requests.push(await awaitRequest(request, 'browserContext'))
  )
  page.on('request', async (request) =>
    requests.push(await awaitRequest(request, 'page'))
  )

  const routePath = '/strategy/strategyStaleWhileRevalidate'
  await mockFetch(browserContext, routePath)

  await page.goto(localhost)
  await awaitServiceWorkerRegistration(page)

  // index.html, sw.js
  requests.shift()
  requests.shift()
  requests.shift()

  // 1st Request - precache
  await expect(requests[0].response.ok).toBe(true)
  await expect(requests[0].allHeaders.referer).toBe(`${domain}/sw.js`)
  await expect(requests[0].url).toBe(`${domain}${routePath}`)

  // 2nd Request
  requests = []
  await page.evaluate(() => fetch('/strategy/strategyStaleWhileRevalidate'))
  await expect(requests.length).toBe(1)

  await browserContext.close()
})
*/
