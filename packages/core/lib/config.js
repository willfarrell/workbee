import { strategyNetworkFirst, strategyNetworkOnly } from './strategies.js'
import { postMessageToFocused, postMessageToAll } from './postMessage.js'

export const pathPattern = (pathPattern) => new RegExp(pathPattern) // eslint-disable-line prefer-regex-literals
export const defaultConfig = {
  // global
  cachePrefix: 'sw-',

  // installEvent
  // { ...Route, routes:Route[] }
  precache: {
    routes: [], // path[]
    strategy: strategyNetworkFirst,
    eventType: false,
    postMessage: postMessageToFocused
  },

  // activateEvent
  activate: {
    eventType: false,
    postMessage: postMessageToAll
  },

  // fetchEvent
  // Route
  methods: [],
  pathPattern: pathPattern('.*$'),
  strategy: strategyNetworkOnly,
  // requestMiddlware: [],
  // responseMiddleware: [],
  cacheName: 'default',
  cacheControlMaxAge: -1, // -1 = disable

  // Route[]
  routes: []
}

// strings
const before = 'before'
const beforeNetwork = 'beforeNetwork'
const afterNetwork = 'afterNetwork'
const after = 'after'
const cachePrefix = 'cachePrefix'
const cacheName = 'cacheName'
const methods = 'methods'
const strategy = 'strategy'
const middlewares = 'middlewares'

export const compileConfig = (config) => {
  const baseConfig = { ...defaultConfig, ...config }
  baseConfig.cacheKey = baseConfig.cachePrefix + baseConfig.cacheName
  baseConfig.before = flattenMiddleware(before, baseConfig)
  baseConfig.beforeNetwork = flattenMiddleware(beforeNetwork, baseConfig)
  baseConfig.afterNetwork = flattenMiddleware(
    afterNetwork,
    baseConfig
  ).reverse()
  baseConfig.after = flattenMiddleware(after, baseConfig).reverse()
  // baseConfig.requestPlugins = flattenMiddleware('request', baseConfig)
  // baseConfig.responsePlugins = flattenMiddleware('response', baseConfig)

  baseConfig.routes = baseConfig.routes.map((route) => {
    const routeConfig = {
      ...pick(baseConfig, [
        cachePrefix,
        cacheName,
        methods,
        strategy,
        middlewares
      ]),
      ...route
    }
    routeConfig.cacheKey = routeConfig.cachePrefix + routeConfig.cacheName
    routeConfig.before = flattenMiddleware(before, routeConfig)
    routeConfig.beforeNetwork = flattenMiddleware(beforeNetwork, routeConfig)
    routeConfig.afterNetwork = flattenMiddleware(
      afterNetwork,
      routeConfig
    ).reverse()
    routeConfig.after = flattenMiddleware(after, routeConfig).reverse()
    // routeConfig.requestPlugins = flattenMiddleware('request', routeConfig)
    // routeConfig.responsePlugins = flattenMiddleware('response', routeConfig)
    return routeConfig
  })

  const precacheConfig = {
    ...defaultConfig.precache,
    ...pick(baseConfig, [cachePrefix, cacheName, middlewares]),
    ...baseConfig.precache
  }
  precacheConfig.cacheKey = baseConfig.cachePrefix + precacheConfig.cacheName
  precacheConfig.before = flattenMiddleware(before, precacheConfig)
  precacheConfig.beforeNetwork = flattenMiddleware(
    beforeNetwork,
    precacheConfig
  )
  precacheConfig.afterNetwork = flattenMiddleware(
    afterNetwork,
    precacheConfig
  ).reverse()
  precacheConfig.after = flattenMiddleware(after, precacheConfig).reverse()
  // precacheConfig.requestPlugins = flattenMiddleware('request', precacheConfig)
  // precacheConfig.responsePlugins = flattenMiddleware('response', precacheConfig)
  precacheConfig.routes = precacheConfig.routes.map((route) => {
    if (typeof route === 'string') route = { path: route }
    const routeConfig = {
      ...pick(precacheConfig, [
        cachePrefix,
        cacheName,
        methods,
        strategy,
        middlewares
      ]),
      ...route
    }
    routeConfig.cacheKey = routeConfig.cachePrefix + routeConfig.cacheName
    routeConfig.before = flattenMiddleware(before, routeConfig)
    routeConfig.beforeNetwork = flattenMiddleware(beforeNetwork, routeConfig)
    routeConfig.afterNetwork = flattenMiddleware(
      afterNetwork,
      routeConfig
    ).reverse()
    routeConfig.after = flattenMiddleware(after, routeConfig).reverse()
    // routeConfig.requestPlugins = flattenMiddleware('request', routeConfig)
    // routeConfig.responsePlugins = flattenMiddleware('response', routeConfig)
    return routeConfig
  })
  baseConfig.precache = precacheConfig

  return baseConfig
}

const pick = (originalObject = {}, keysToPick = []) => {
  const newObject = {}
  for (const path of keysToPick) {
    // only supports first level
    if (originalObject[path] !== undefined) {
      newObject[path] = originalObject[path]
    }
  }
  return newObject
}

const flattenMiddleware = (type, routeConfig) =>
  routeConfig.middlewares
    .map((middleware) => middleware[type])
    .filter((middleware) => middleware)
