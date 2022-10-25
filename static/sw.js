/* eslint-env: serviceworker */
/* global addEventListener */

// workboox for size comparison
/* importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js'
)
workbox.setConfig({
  debug: false
})
const {
  backgroundSync,
  broadcastUpdate,
  cacheableResponse,
  core,
  expiration,
  googleAnalytics,
  navigationPreload,
  precaching,
  rangeRequests,
  routing,
  strategies,
  streams,
  recipes
} = workbox
dev: 748+ 9491+ 8769+ 3537+ 8818+ 2600+ 7700+ 10146+ 903+ 10198+ 2664+ 2791+ 2238 = 70603
prod: 748+ 2943+ 1457+ 778+ 356+ 2510+ 917+ 1473+ 2280+ 321+ 2559+ 802+ 698+ 1060 = 18902
*/
// end

import {
  pathPattern,
  compileConfig,
  eventInstall,
  eventActivate,
  eventFetch,
  backgroundFetchSuccessEvent,
  backgroundFetchFailEvent,
  cacheOverrideEvent,
  strategyNetworkOnly,
  strategyCacheOnly,
  strategyNetworkFirst,
  strategyCacheFirst,
  strategyStaleWhileRevalidate,
  strategyIgnore,
  strategyCacheFirstIgnore,
  strategyStatic,
  // strategyLocalDownload,
  strategyPartition,
  strategyHTMLPartition
} from '../packages/core/index.js'
import loggerMiddleware from '../packages/logger/index.js'
import cacheControlMiddleware from '../packages/cache-control/index.js'
import fallbackMiddleware from '../packages/fallback/index.js'
import offlineMiddleware from '../packages/offline/index.js'
import saveDataMiddleware from '../packages/save-data/index.js'

// Shared middleware
const offline = offlineMiddleware({
  pollDelay: 0 // Disabled in favour of `onlineEvent`
})

const config = compileConfig({
  cachePrefix: 'sw-',
  precache: {
    routes: [
      '/strategy/strategyCacheOnly',
      '/strategy/strategyStaleWhileRevalidate',
      '/middleware/fallbackMiddleware',
      '/middleware/saveDataMiddleware'
    ]
  },
  routes: [
    {
      pathPattern: pathPattern('strategyNetworkOnly$'),
      cacheName: 'strategyNetworkOnly',
      strategy: strategyNetworkOnly
    },
    {
      pathPattern: pathPattern('strategyCacheOnly$'),
      strategy: strategyCacheOnly
    },
    {
      pathPattern: pathPattern('strategyNetworkFirst$'),
      cacheName: 'strategyNetworkFirst',
      strategy: strategyNetworkFirst
    },
    {
      pathPattern: pathPattern('strategyCacheFirst$'),
      cacheName: 'strategyCacheFirst',
      strategy: strategyCacheFirst
    },
    {
      pathPattern: pathPattern('strategyStaleWhileRevalidate$'),
      strategy: strategyStaleWhileRevalidate
    },
    {
      pathPattern: pathPattern('strategyIgnore$'),
      strategy: strategyIgnore
    },
    {
      pathPattern: pathPattern('strategyCacheFirstIgnore$'),
      strategy: strategyCacheFirstIgnore
    },
    // {
    //   methods: ['POST'],
    //   pathPattern: new RegExp('strategyLocalDownload/download.json$'),
    //   strategy: strategyLocalDownload
    // },
    {
      pathPattern: pathPattern('(strategyHTMLPartition)$'),
      cacheName: 'strategyHTMLPartition',
      strategy: strategyHTMLPartition(
        compileConfig({
          routes: [
            { path: '$1.header.html' },
            { path: '$1.main.html' },
            { path: '$1.footer.html' }
          ],
          cacheName: 'strategyHTMLPartition',
          strategy: strategyNetworkFirst,
          middlewares: [
            cacheControlMiddleware({ cacheControl: 'max-age=60' }),
            loggerMiddleware()
          ]
        })
      )
    },
    {
      pathPattern: pathPattern('(strategyPartition)$'),
      cacheName: 'strategyPartition',
      strategy: strategyPartition(
        compileConfig({
          routes: [
            { path: '$1.header.html' },
            { path: '$1.main.html' },
            { path: '$1.footer.html' }
          ],
          cacheName: 'strategyHTMLPartition',
          strategy: strategyNetworkFirst,
          middlewares: [
            cacheControlMiddleware({ cacheControl: 'max-age=60' }),
            loggerMiddleware()
          ]
        })
      )
    },
    {
      pathPattern: pathPattern('cacheControlMiddleware$'),
      cacheName: 'cacheControlMiddleware',
      strategy: strategyNetworkOnly,
      middlewares: [
        cacheControlMiddleware({ cacheControl: 'max-age=30' }),
        loggerMiddleware()
      ]
    },
    {
      pathPattern: pathPattern('fallbackMiddleware$'),
      cacheName: 'fallbackMiddleware',
      strategy: strategyCacheOnly,
      middlewares: [
        fallbackMiddleware({
          path: '/middleware/fallbackMiddleware',
          fallbackStrategy: strategyCacheFirst // default
        }),
        cacheControlMiddleware({ cacheControl: 'max-age=60' }),
        loggerMiddleware()
      ]
    },
    {
      methods: ['POST'],
      pathPattern: pathPattern('offlineMiddleware$'),
      cacheName: 'offlineMiddleware',
      strategy: strategyStatic(new Error('offline')),
      middlewares: [offline, loggerMiddleware()]
    },
    {
      pathPattern: pathPattern('saveDataMiddleware$'),
      strategy: strategyNetworkOnly,
      middlewares: [
        saveDataMiddleware({
          saveDataStrategy: strategyCacheOnly // default
        }),
        loggerMiddleware()
      ]
    }
    /* {
      methods: ['POST'],
      path: new RegExp('login$'),
      cacheName: 'sessionMiddleware'
    },
    {
      path: new RegExp('authn$'),
      cacheName: 'authn'
    },
    {
      methods: ['POST'],
      path: new RegExp('logout$'),
      cacheName: 'logout'
    } */
  ],
  methods: ['GET'],
  strategy: strategyNetworkOnly,
  middlewares: [
    cacheControlMiddleware({ cacheControl: 'max-age=60' }),
    loggerMiddleware()
  ]
})

addEventListener('install', (event) => {
  eventInstall(event, config)
})

addEventListener('activate', (event) => {
  eventActivate(event, config)
})

addEventListener('fetch', (event) => {
  eventFetch(event, config)
})

addEventListener('message', (event) => {
  const { data } = event
  console.log('message', data)
  event.waitUntil(messageEvents[data.type](data))
})

const messageEvents = {
  cache: cacheOverrideEvent(config),
  online: offline.onlineEvent
}

addEventListener('sync', (event) => {
  const { data } = event
  console.log('sync', data)
  event.waitUntil(syncEvents[data.tag](data))
})

const syncEvents = {
  online: offline.onlineEvent
}

addEventListener('periodicsync', (event) => {
  const { data } = event
  console.log('periodicsync', data)
  event.waitUntil(periodicSyncEvents[data.tag](data))
})

const periodicSyncEvents = {
  online: offline.onlineEvent
}

addEventListener('backgroundfetchsuccess', (event) => {
  backgroundFetchSuccessEvent(event, config)
})

addEventListener('backgroundfetchfail', (event) => {
  backgroundFetchFailEvent(event, config)
})
