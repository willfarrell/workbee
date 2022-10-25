/* global Request */
import test from 'node:test'
import { deepEqual } from 'node:assert'
import { domain, setupMocks } from '../../test-unit/helper.js'
import { pathPattern, strategyCacheOnly } from '../core/index.js'
import fallbackMiddleware from './index.js'

test('fallbackMiddleware.after: Should skip the request if ok', async (t) => {
  const request = new Request(`${domain}/200`, { method: 'GET' })
  const response = await fetch(request)
  const fallbackPath = `${domain}/cache/found`
  // const fallbackResponse = await fetch(new Request(fallbackPath))

  const fallback = fallbackMiddleware({
    path: fallbackPath,
    fallbackStrategy: strategyCacheOnly
  })
  const { event, config } = setupMocks(undefined, fallbackPath)
  const output = await fallback.after(request, response, event, config)

  deepEqual(output, response)
})

test('fallbackMiddleware.after: Should skip the request if not included statusCodes', async (t) => {
  const request = new Request(`${domain}/404`, { method: 'GET' })
  const response = await fetch(request)
  const fallbackPath = `${domain}/cache/found`
  // const fallbackResponse = await fetch(new Request(fallbackPath))

  const fallback = fallbackMiddleware({
    path: fallbackPath,
    statusCodes: [403],
    fallbackStrategy: strategyCacheOnly
  })
  const { event, config } = setupMocks(undefined, fallbackPath)
  const output = await fallback.after(request, response, event, config)

  deepEqual(output, response)
})

test('fallbackMiddleware.after: Should request from cache when not ok', async (t) => {
  const request = new Request(`${domain}/404`, { method: 'GET' })
  const response = await fetch(request)
  const fallbackPath = `${domain}/cache/found`
  const fallbackResponse = await fetch(new Request(fallbackPath))

  const fallback = fallbackMiddleware({
    path: fallbackPath,
    fallbackStrategy: strategyCacheOnly
  })
  const { event, config } = setupMocks(undefined, fallbackPath)
  const output = await fallback.after(request, response, event, config)

  deepEqual(output, fallbackResponse)
})

test('fallbackMiddleware.after: Should request from cache (default) when not ok', async (t) => {
  const request = new Request(`${domain}/404`, { method: 'GET' })
  const response = await fetch(request)
  const fallbackPath = `${domain}/cache/found`
  const fallbackResponse = await fetch(new Request(fallbackPath))

  const fallback = fallbackMiddleware({
    path: fallbackPath
  })
  const { event, config } = setupMocks(undefined, fallbackPath)
  const output = await fallback.after(request, response, event, config)

  deepEqual(output, fallbackResponse)
})

test('fallbackMiddleware.after: Should request when not ok', async (t) => {
  const request = new Request(`${domain}/404`, { method: 'GET' })
  const response = await fetch(request)
  const fallbackPath = `${domain}/cache/found`
  const fallbackResponse = await fetch(new Request(fallbackPath))

  const fallback = fallbackMiddleware({
    path: fallbackPath
  })
  const { event, config } = setupMocks(undefined, `${domain}/cache/notfound`)
  const output = await fallback.after(request, response, event, config)

  deepEqual(output, fallbackResponse)
})

test('fallbackMiddleware.after: Should request when not ok and using pathPattern', async (t) => {
  const request = new Request(`${domain}/404`, { method: 'GET' })
  const response = await fetch(request)
  const fallbackPath = `${domain}/$1/200`
  const fallbackResponse = await fetch(new Request(`${domain}/en/200`))

  const fallback = fallbackMiddleware({
    pathPattern: pathPattern('.+/(en|fr)/.+'),
    path: fallbackPath
  })
  const { event, config } = setupMocks(undefined, `${domain}/cache/notfound`)
  const output = await fallback.after(request, response, event, config)

  deepEqual(output, fallbackResponse)
})
