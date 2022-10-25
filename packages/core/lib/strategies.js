/* eslint-env: serviceworker */
/* global ReadableStream */
import { fetchInlineStrategy } from './events.js'
import { openCaches, cachePut, cacheExpirable } from './cache.js'
import {
  newRequest,
  isResponse,
  newResponse,
  addHeaderToResponse,
  urlRemoveHash
} from './http.js'

export const strategyNetworkOnly = async (request, event, config) => {
  for (const beforeNetwork of config.beforeNetwork) {
    request = await beforeNetwork(request, event, config)
  }
  let response
  try {
    response = await fetch(request)
  } catch (e) {
    response = e
  }
  for (const afterNetwork of config.afterNetwork) {
    response = await afterNetwork(request, response, event, config)
  }
  if (isResponse(response)) {
    return response
  }
  throw response
}

export const strategyCacheOnly = async (request, event, config) => {
  const cache = openCaches[config.cacheKey]
  if (!cache) return
  return cache.match(request)
}

const cacheControlMaxAgeRegExp = /(max-age|s-maxage)=([0-9]+)/
export const strategyNetworkFirst = async (request, event, config) => {
  let response
  try {
    response = await strategyNetworkOnly(request, event, config)
  } catch (e) {
    response = await strategyCacheOnly(request, event, config)

    // no cache value
    if (!response) {
      throw e
    }
    return response
  }
  if (response.ok) {
    // Add in Expires header to allow expiry of cache without complex logic
    const cacheControl = response.headers.get('Cache-Control')

    const maxAge =
      !cacheControl || cacheControl.includes('no-cache')
        ? 0
        : Number.parseInt(cacheControl.match(cacheControlMaxAgeRegExp)[2])

    if (maxAge) {
      const responseTime = new Date(response.headers.get('Date')).getTime()
      response = addHeaderToResponse(
        response,
        'Expires',
        new Date(responseTime + maxAge * 1000).toString()
      )

      event.waitUntil(cachePut(config.cacheKey, request, response.clone()))
    }
  }
  return response
}

export const strategyCacheFirst = async (request, event, config) => {
  let response = await strategyCacheOnly(request, event, config)
  if (cacheExpirable(response)) {
    // cache expired - spoof undefined to preserve cache in case of network failure
    response = undefined
  }
  // cache undefined
  response ??= await strategyNetworkFirst(request, event, config)
  return response
}

export const strategyStaleWhileRevalidate = async (request, event, config) => {
  let response = await strategyCacheOnly(request, event, config)
  if (response) {
    event.waitUntil(strategyNetworkFirst(request, event, config))
  }
  // cache undefined
  response ??= await strategyNetworkFirst(request, event, config)
  return response
}

export const strategyIgnore = (request, event, config) => {
  return newResponse({ status: 408, url: request.url })
}

export const strategyCacheFirstIgnore = async (request, event, config) => {
  let response = await strategyCacheOnly(request, event, config)
  if (cacheExpirable(response)) {
    response = undefined
  }
  response ??= strategyIgnore(request, event, config)
  return response
}

export const strategyStatic = (response) => {
  const strategyStatic = (request, event, config) => {
    // Allow response to be an error
    return response?.clone?.() ?? response
  }
  return strategyStatic
}

/* export const strategyLocalDownload = (request, event, config) => {
  const pathname = new URL(request.url).pathname.split('/')
  const filename = pathname[pathname.length - 1]
  return newResponse({status:201, body:request.body},{
      Date: new Date().toString(),
      'Content-Type': request.headers.get('Content-Type'),
      'Content-Disposition': `attachment; filename="${filename}"`
    })
  })
} */

// From Mozilla
/* export const strategyFormDownload = async (request, event, config) => {
  const data = await request.formData()
  const filename = data.get('filename')
  const contentType = data.get('type')
  const body = data.get('body')
  return newResponse(body, {
    status: 201,
    headers: new Headers({
      Date: new Date().toString(),
      'Content-Type': contentType,
      'Content-Disposition': `attachment;filename="${filename}"`
    })
  })
} */

export const strategyHTMLPartition = (options = {}) => {
  options.makeRequest = (request, config, routeConfig) => {
    const url = urlRemoveHash(request.url).replace(
      config.pathPattern,
      routeConfig.path
    )
    return newRequest(url, { ...request })
  }
  return strategyPartition(options)
}

// { makeRequest, routes, strategy, ... }
export const strategyPartition = (options = {}) => {
  return async (request, event, config) => {
    const responses = options.routes.map((routeConfig) => {
      let subRequest = request
      if (options.makeRequest) {
        subRequest = options.makeRequest(request, config, routeConfig)
      }
      return fetchInlineStrategy(subRequest, event, routeConfig)
    })
    const { body, headers, streamDeferred } = streamResponses(responses)

    event.waitUntil(streamDeferred)

    return newResponse({ body }, headers)
  }
}

const streamResponses = (responses) => {
  let body, headers
  const streamDeferred = new Promise((resolve, reject) => {
    body = new ReadableStream({
      async pull (controller) {
        if (responses.length) {
          const response = await responses.shift()
          headers ??= response.headers
          const body = await response.arrayBuffer()
          controller.enqueue(new Uint8Array(body))
        } else {
          controller.close()
          resolve()
        }
      },
      cancel () {
        resolve()
      }
    })
  })
  return { body, headers, streamDeferred }
}

/* const streamResponses = (responses) => {
  const readers = responses.map((sourcePromise) =>
    sourcePromise.then((source) => {
      if (source instanceof Response) {
        headers ??= source.headers
        return source.body.getReader()
      }
      if (source instanceof ReadableStream) {
        return source.getReader()
      }
      return newResponse({body:source}).body.getReader()
    })
  )
  let i = 0
  let stream
  let headers
  const streamDeferred = new Promise((resolve, reject) => {
    stream = new ReadableStream({
      pull(controller) {
        return readers[i]
          .then((reader) => reader.read())
          .then((result) => {
            if (result.done) {
              i += 1
              if (i < readers.length) return this.pull(controller)

              controller.close()
              resolve()
            } else {
              controller.enqueue(result.value)
            }
          })
          .catch((e) => {
            reject(e)
            throw e
          })
      },
      cancel() {
        resolve()
      }
    })
  })
  return { stream, headers, streamDeferred }
} */
