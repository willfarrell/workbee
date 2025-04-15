/* global Headers Request Response */
import sinon from 'sinon'
import makeServiceWorkerEnv from 'service-worker-mock'
import {
  compileConfig,
  openCaches,
  strategyCacheOnly
} from '../packages/core/index.js'
const { caches } = makeServiceWorkerEnv()

export const cachesOverride = caches
export const documentOverride = {
  console: {
    log: console.log,
    error: console.error
  }
}
export const navigatorOverride = {
  onLine: true
}
export const domain = 'http://localhost:8080'

const mockResponses = {
  [`${domain}/200`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'max-age=86400',
        Date: new Date().toUTCString()
      })
    }),
  [`${domain}/403`]: () =>
    new Response('', { status: 403, statusText: 'Unauthorized' }),
  [`${domain}/404`]: () =>
    new Response('', { status: 404, statusText: 'Not Found' }),
  [`${domain}/503`]: () =>
    new Response('', { status: 503, statusText: 'Service Unavailable' }),

  [`${domain}/en/200`]: () =>
    new Response('', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'max-age=86400',
        Date: new Date().toUTCString()
      })
    }),

  [`${domain}/en/404`]: () =>
    new Response('', { status: 404, statusText: 'Not Found' }),

  [`${domain}/cache-control/max-age=86400`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'max-age=86400',
        Date: new Date().toUTCString()
      })
    }),
  [`${domain}/cache-control/no-cache`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-cache',
        Date: new Date().toUTCString()
      })
    }),
  [`${domain}/cache-control/max-age=0`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'max-age=0',
        Date: new Date().toUTCString()
      })
    }),
  [`${domain}/cache-control/null`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        Date: new Date().toUTCString()
      })
    }),

  [`${domain}/cache/found`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'max-age=86400',
        Date: new Date().toUTCString(),
        Expires: new Date(Date.now() + 86400 * 1000).toUTCString()
      })
    }),
  [`${domain}/cache/expired`]: () =>
    new Response('{}', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'max-age=86400',
        Date: new Date(Date.now() - 86400 * 1000).toUTCString(),
        Expires: new Date(Date.now() - 86400 * 1000).toUTCString()
      })
    }),
  [`${domain}/cache/notfound`]: () => undefined,
  [`${domain}/header`]: () =>
    new Response('<html><head></head><body><header></header>', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        Date: new Date().toUTCString()
      })
    }),
  [`${domain}/main`]: () =>
    new Response('<main></main><script></script>', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        Date: new Date().toUTCString()
      })
    }),
  [`${domain}/footer`]: () =>
    new Response('<footer></footer></body></html>', {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json; charset=UTF-8',
        Date: new Date().toUTCString()
      })
    })
}
export const fetchOverride = (request) => {
  if (request.url === `${domain}/offline`) throw new Error('offline')

  if (!mockResponses[request.url]) console.log(request.url)
  const mockResponse = mockResponses[request.url]()
  if (mockResponse || request.url === `${domain}/cache/notfound`) {
    return Promise.resolve(mockResponse)
  }
  throw new Error('mock missing')
}

export const setupMocks = (
  strategy = strategyCacheOnly,
  cacheMatch = `${domain}/cache/found`
) => {
  const cache = {
    put: sinon.spy(),
    match: () => {},
    delete: sinon.spy()
  }
  if (cacheMatch) {
    sinon.stub(cache, 'match').resolves(fetch(new Request(cacheMatch)))
  } else {
    cache.match = sinon.spy()
  }
  openCaches['sw-default'] = cache

  const middleware = {
    before: sinon.stub().callsFake((request) => request),
    beforeNetwork: sinon.stub().callsFake((request) => request),
    afterNetwork: sinon.stub().callsFake((request, response) => response),
    after: sinon.stub().callsFake((request, response) => response)
  }

  const waitUntils = []
  const event = {
    waitUntil: (fct) => waitUntils.push(fct),
    resolveWaitUntils: () => Promise.all(waitUntils)
  }

  const config = compileConfig({
    strategy,
    middlewares: [middleware]
  })

  return { cache, middleware, event, config }
}

Object.assign(global, {
  caches: cachesOverride,
  document: documentOverride,
  fetch: fetchOverride,
  navigtor: navigatorOverride
})
