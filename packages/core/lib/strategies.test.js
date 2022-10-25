/* global Request */
import test from 'node:test'
import { equal, deepEqual } from 'node:assert'
import { setTimeout } from 'node:timers/promises'
import { domain, setupMocks } from '../../../test-unit/helper.js'
import sinon from 'sinon'
import {
  pathPattern,
  compileConfig,
  fetchStrategy,
  fetchInlineStrategy,
  strategyNetworkOnly,
  strategyNetworkFirst,
  strategyCacheOnly,
  strategyCacheFirst,
  strategyStaleWhileRevalidate,
  strategyCacheFirstIgnore,
  strategyIgnore,
  strategyHTMLPartition
} from '../index.js'

// Strategies
test('Strategies', async (t) => {
  // *** strategyNetworkOnly *** //
  await t.test(
    'strategyNetworkOnly: Should resolve 200 from network',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(strategyNetworkOnly)

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyNetworkOnly: Should resolve 404 from network',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/404`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(strategyNetworkOnly)

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 404)
    }
  )

  await t.test('strategyNetworkOnly: Should throw from network', async (t) => {
    const event = {
      __request: new Request(`${domain}/offline`, {
        method: 'GET'
      })
    }
    const { cache, middleware, config } = setupMocks(strategyNetworkOnly)
    try {
      await fetchInlineStrategy(event.__request, event, config)
    } catch (e) {
      deepEqual(e, new Error('offline'))

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 0)
    }
  })

  // *** strategyCacheOnly *** //
  await t.test(
    'strategyCacheOnly: Should resolve undefined from cache when not found',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }

      const { cache, middleware, config } = setupMocks(
        strategyCacheOnly,
        `${domain}/cache/notfound`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 0)
      equal(middleware.afterNetwork.callCount, 0)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response, undefined)
    }
  )

  await t.test(
    'strategyCacheOnly: Should resolve 200 from cache when exists',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyCacheOnly,
        `${domain}/cache/found`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 0)
      equal(middleware.afterNetwork.callCount, 0)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(await response.text(), '{}')
    }
  )

  // *** strategyNetworkFirst *** //
  await t.test(
    'strategyNetworkFirst: Should resolve 200 from network and cache with {Cache-Control:max-age=86400}',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/cache-control/max-age=86400`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(strategyNetworkFirst)

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 1)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(
        new Date(response.headers.get('Date')) <
          new Date(response.headers.get('Expires')),
        true
      )
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyNetworkFirst: Should resolve 200 from network and not cache with {Cache-Control:no-cache}',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/cache-control/no-cache`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(strategyNetworkFirst)

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(response.headers.get('Expires'), null)
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyNetworkFirst: Should resolve 200 from network and cache with {Cache-Control:max-age=0}',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/cache-control/max-age=0`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(strategyNetworkFirst)

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(response.headers.get('Expires'), null)
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyNetworkFirst: Should resolve 200 from network and cache with {Cache-Control:null}',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/cache-control/null`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(strategyNetworkFirst)

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(response.headers.get('Expires'), null)
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyNetworkFirst: Should resolve 200 from cache when network offline',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/offline`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyNetworkFirst,
        `${domain}/cache/found`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyNetworkFirst: Should throw when network offline and no cache',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/offline`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyNetworkFirst,
        `${domain}/cache/notfound`
      )

      try {
        await fetchInlineStrategy(event.__request, event, config)
      } catch (e) {
        deepEqual(e, new Error('offline'))

        equal(middleware.before.callCount, 1)
        equal(middleware.beforeNetwork.callCount, 1)
        equal(middleware.afterNetwork.callCount, 1)
        equal(cache.match.callCount, 1)
        equal(cache.put.callCount, 0)
        equal(cache.delete.callCount, 0)
        equal(middleware.after.callCount, 0)
      }
    }
  )

  // *** strategyCacheFirst *** //
  await t.test(
    'strategyCacheFirst: Should resolve 200 from network when no cache',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyCacheFirst,
        `${domain}/cache/notfound`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 1)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyCacheFirst: Should resolve 200 from cache',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/404`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyCacheFirst,
        `${domain}/cache/found`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 0)
      equal(middleware.afterNetwork.callCount, 0)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 200)
      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyCacheFirst: Should resolve 200 from cache when expired',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/offline`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyCacheFirst,
        `${domain}/cache/expired`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(cache.match.callCount, 2)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(await response.text(), '{}')
    }
  )

  // *** strategyStaleWhileRevalidate *** //
  await t.test(
    'strategyStaleWhileRevalidate: Should resolve 200 from network when no cache',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyStaleWhileRevalidate,
        `${domain}/cache/notfound`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(cache.match.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.put.callCount, 1)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyStaleWhileRevalidate: Should resolve 200 from cache',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/404`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyStaleWhileRevalidate,
        `${domain}/cache/found`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(cache.match.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(await response.text(), '{}')
    }
  )

  await t.test(
    'strategyStaleWhileRevalidate: Should resolve 200 from network',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyStaleWhileRevalidate,
        `${domain}/cache/notfound`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 1)
      equal(middleware.afterNetwork.callCount, 1)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 1)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(await response.text(), '{}')
    }
  )

  // *** strategyIgnore *** //
  await t.test('strategyIgnore: Should always return 408', async (t) => {
    const event = {
      __request: new Request(`${domain}/offline`, {
        method: 'GET'
      })
    }
    const { cache, middleware, config } = setupMocks(strategyIgnore)
    const response = await fetchInlineStrategy(event.__request, event, config)

    equal(middleware.before.callCount, 1)
    equal(middleware.beforeNetwork.callCount, 0)
    equal(middleware.afterNetwork.callCount, 0)
    equal(cache.match.callCount, 0)
    equal(cache.put.callCount, 0)
    equal(cache.delete.callCount, 0)
    equal(middleware.after.callCount, 1)

    equal(response.status, 408)
    equal(await response.text(), '')
  })

  // *** strategyCacheFirstIgnore *** //
  await t.test(
    'strategyCacheFirstIgnore: Should resolve 408 from network',
    async (t) => {
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        })
      }
      const { cache, middleware, config } = setupMocks(
        strategyCacheFirstIgnore,
        `${domain}/cache/notfound`
      )

      const response = await fetchInlineStrategy(event.__request, event, config)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 0)
      equal(middleware.afterNetwork.callCount, 0)
      equal(cache.match.callCount, 1)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(middleware.after.callCount, 1)

      equal(response.status, 408)
      equal(await response.text(), '')
    }
  )

  // *** strategyHTMLPartition *** //
  await t.test(
    'strategyHTMLPartition: Should resolve 200 from network',
    async (t) => {
      const waitUntils = []
      const event = {
        __request: new Request(`${domain}/200`, {
          method: 'GET'
        }),
        waitUntil: (fct) => waitUntils.push(fct)
      }
      const nestedMiddleware = {
        before: sinon.stub().callsFake((request) => request),
        beforeNetwork: sinon.stub().callsFake((request) => request),
        afterNetwork: sinon.stub().callsFake((request, response) => response),
        after: sinon.stub().callsFake((request, response) => response)
      }
      const { cache, middleware, config } = setupMocks(
        strategyHTMLPartition(
          compileConfig({
            routes: [
              { path: '$1/header' },
              { path: '$1/main' },
              { path: '$1/footer' }
            ],
            strategy: strategyNetworkOnly,
            middlewares: [nestedMiddleware]
          })
        )
      )
      config.pathPattern = pathPattern('(.*?)/([^/]*?)$')

      const res = fetchStrategy(event.__request, event, config)
      await Promise.all(waitUntils)
      const response = await res
      await setTimeout(100)

      equal(response.status, 200)

      equal(middleware.before.callCount, 1)
      equal(middleware.beforeNetwork.callCount, 0)
      equal(middleware.afterNetwork.callCount, 0)
      equal(nestedMiddleware.before.callCount, 3)
      equal(nestedMiddleware.beforeNetwork.callCount, 3)
      equal(nestedMiddleware.afterNetwork.callCount, 3)
      equal(cache.match.callCount, 0)
      equal(cache.put.callCount, 0)
      equal(cache.delete.callCount, 0)
      equal(nestedMiddleware.after.callCount, 3)
      equal(middleware.after.callCount, 1)

      equal(
        await response.text(),
        '<html><head></head><body><header></header><main></main><script></script><footer></footer></body></html>'
      )
    }
  )
})
