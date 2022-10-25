/* eslint-env: serviceworker */
/* global skipWaiting clients BroadcastChannel */
import { cachesDelete } from './cache.js'
import { newRequest } from './http.js'
import { consoleError } from './console.js'

export const eventInstall = (event, config) => {
  event.waitUntil(eventInstallWaitUntil(event, config))
  skipWaiting()
}

const eventInstallWaitUntil = async (event, config) => {
  let { routes, postMessage, extract, eventType } = config.precache
  // Use and external config
  if (typeof routes === 'string') {
    const response = await fetchInlineStrategy(
      newRequest(routes),
      event,
      config.precache
    )

    routes = await extract(response)
  }
  await Promise.all(
    routes.map((routeConfig) =>
      fetchInlineStrategy(newRequest(routeConfig.path), event, routeConfig)
    )
  )

  if (eventType) {
    await postMessage({ type: eventType })
  }
}

// TODO move to plugin package
export const precacheExtractJSON = (response) => {
  if (response.headers.get('Content-Type') !== 'application/json') return []
  return response.json()
}

// @datastream/compress/zip - chunk == file + metadata
// export const precacheExtractZip = (response) => {
//   if (response.headers.get('Content-Type') !== 'application/zip') return []new
//   // TODO
// }

export const eventActivate = (event, config) => {
  event.waitUntil(eventActivateWaitUntil(event, config))
  event.waitUntil(clients.claim())
}

const eventActivateWaitUntil = async (event, config) => {
  const exclude = config.precache.routes
    .concat(config.routes)
    .map((routeConfig) => routeConfig.cacheKey)
  await cachesDelete(exclude)
  const { postMessage, eventType } = config.activate
  if (eventType) {
    await postMessage({ type: eventType })
  }
}

export const eventFetch = (event, config) => {
  event.respondWith(eventFetchRespondWith(event, config))
}

const eventFetchRespondWith = async (event, config) => {
  return fetchStrategy(
    event.request,
    event,
    findRouteConfig(config, event.request)
  )
}

export const findRouteConfig = (config, request) => {
  const { method, url } = request
  for (const routeConfig of config.routes) {
    if (
      routeConfig.methods.includes(method) &&
      routeConfig.pathPattern.test(url)
    ) {
      return routeConfig
    }
  }
  return config
}

export const fetchInlineStrategy = async (request, event, config) => {
  // process waitUntil inline due to being nested
  const waitUntils = []
  const waitUntil = (promise) => waitUntils.push(promise)
  const response = await fetchStrategy(
    request,
    {
      ...event,
      waitUntil
    },
    config
  )
  await Promise.all(waitUntils)
  return response
}

export const fetchStrategy = async (request, event, config) => {
  for (const before of config.before) {
    request = await before(request, event, config)
  }
  let response
  try {
    response = await config.strategy(request, event, config)
  } catch (e) {
    response = e
  }
  for (const after of config.after) {
    response = await after(request, response, event, config)
  }
  return response
}

// Event: Push Notifications
export const periodicSyncEvent = (event) => {}

export const pushEvent = (event, { init, shutdown }) => {
  // https://developer.mozilla.org/en-US/docs/Web/API/PushEvent
  /* const { type } = event.data.json()

  switch (type) {
    case 'init':
      init()
      break
    case 'shutdown':
      shutdown()
      break
  } */
}

export const notificationClickEvent = (event) => {
  /* event.notification.close()

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url == '/' && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow('/')
    })
  ) */
}

export const backgroundFetchSuccessEvent = (event) => {
  event.waitUntil(backgroundFetchSuccessEventWaitUntil(event))
}

const backgroundFetchSuccessEventWaitUntil = async ({ registration }) => {
  new BroadcastChannel(registration.id).postMessage({ stored: true })
}

export const backgroundFetchFailEvent = (event) => {
  consoleError(event)
}
