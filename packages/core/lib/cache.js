/* eslint-env: serviceworker */
/* global caches */
import { findRouteConfig } from './events.js'
import { newRequest, newResponse } from './http.js'
import { consoleError } from './console.js'

export const openCaches = {}

export const cacheOverrideEvent = (config) => {
  return (messageEvent) => {
    let { request, response } = messageEvent
    const routeConfig = findRouteConfig(config, messageEvent.request).cacheKey
    if (typeof request === 'string') {
      request = newRequest(request)
    }
    if (typeof response === 'string') {
      response = newResponse({ url: request.url, body: response })
    }
    return cachePut(routeConfig.cacheKey, request, response)
  }
}

export const cachePut = async (cacheKey, request, response, retry = 0) => {
  openCaches[cacheKey] ??= await caches.open(cacheKey)
  const cache = openCaches[cacheKey]
  try {
    await cache.put(request.url, response.clone())
    return
  } catch (e) {
    if (e.name !== 'QuotaExceededError') {
      consoleError(e.name, cacheKey, request, response)
      // TODO postMessage?
      throw e
    }
  }
  if (retry === 0) {
    // Remove expired from same cacheKey
    await cacheDeleteExpired(cacheKey)
  } else if (retry === 1) {
    // Remove expired from all caches
    await cachesDeleteExpired()
  } else {
    return
  }
  return cachePut(cacheKey, request, response, ++retry)
}

export const cacheExpired = (response) => {
  if (!response) return
  const expires = response.headers.get('Expires')
  const expiresDate = new Date(expires).getTime()
  const nowDate = Date.now()
  return expiresDate < nowDate
}

export const cacheDeleteExpired = async (cacheKey) => {
  const cache = await caches.open(cacheKey)
  const responses = await cache.matchAll('/')
  for (const response of responses ?? []) {
    if (cacheExpired(response)) {
      await cache.delete(response)
    }
  }
}

export const cachesDeleteExpired = async () => {
  const existingCacheKeys = await caches.keys()
  const cacheExipres = []
  for (const cacheKey of existingCacheKeys) {
    cacheExipres.push(cacheDeleteExpired(cacheKey))
  }
  return Promise.all(cacheExipres)
}

export const cachesDelete = async (exclude = []) => {
  return caches.keys().then((existingCacheKeys) => {
    const validCacheSet = new Set([...exclude])
    return Promise.all(
      existingCacheKeys
        .filter((existingCacheKey) => {
          return !validCacheSet.has(existingCacheKey)
        })
        .map(caches.delete)
    )
  })
}
