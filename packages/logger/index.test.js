/* global Request */
import test from 'node:test'
import { equal, deepEqual } from 'node:assert'
import { domain, setupMocks } from '../../test-unit/helper.js'
import sinon from 'sinon'
import loggerMiddleware from './index.js'

test('loggerMiddleware: Should trigger console by default', async (t) => {
  const request = new Request(`${domain}/200`, { method: 'GET' })
  const response = await fetch(request)

  const loggerSpy = sinon.spy()
  const logger = loggerMiddleware()
  const { event, config } = setupMocks(undefined, `${domain}/200`)
  const outputRequest = await logger.before(request, event, config)
  const outputResponse = await logger.after(request, response, event, config)

  deepEqual(outputRequest, request)
  deepEqual(outputResponse, response)
  equal(loggerSpy.callCount, 0)
})

test('loggerMiddleware.before: Should trigger before', async (t) => {
  const request = new Request(`${domain}/200`, { method: 'GET' })

  const loggerSpy = sinon.spy()
  const logger = loggerMiddleware({
    logger: loggerSpy,
    runOnBefore: true
  })
  const { event, config } = setupMocks(undefined, `${domain}/200`)
  const outputRequest = await logger.before(request, event, config)

  deepEqual(outputRequest, request)
  equal(loggerSpy.callCount, 1)
})

test('loggerMiddleware.beforeNetwork: Should trigger beforeNetwork', async (t) => {
  const request = new Request(`${domain}/200`, { method: 'GET' })

  const loggerSpy = sinon.spy()
  const logger = loggerMiddleware({
    logger: loggerSpy,
    runOnBeforeNetwork: true
  })
  const { event, config } = setupMocks(undefined, `${domain}/200`)
  const outputRequest = await logger.beforeNetwork(request, event, config)

  deepEqual(outputRequest, request)
  equal(loggerSpy.callCount, 1)
})

test('loggerMiddleware.afterNetwork: Should trigger afterNetwork', async (t) => {
  const request = new Request(`${domain}/200`, { method: 'GET' })
  const response = await fetch(request)

  const loggerSpy = sinon.spy()
  const logger = loggerMiddleware({
    logger: loggerSpy,
    runOnAfterNetwork: true
  })
  const { event, config } = setupMocks(undefined, `${domain}/200`)
  const outputResponse = await logger.afterNetwork(
    request,
    response,
    event,
    config
  )

  deepEqual(outputResponse, response)
  equal(loggerSpy.callCount, 1)
})

test('loggerMiddleware.after: Should trigger after', async (t) => {
  const request = new Request(`${domain}/200`, { method: 'GET' })
  const response = await fetch(request)

  const loggerSpy = sinon.spy()
  const logger = loggerMiddleware({
    logger: loggerSpy,
    runOnAfter: true
  })
  const { event, config } = setupMocks(undefined, `${domain}/200`)
  const outputResponse = await logger.after(request, response, event, config)

  deepEqual(outputResponse, response)
  equal(loggerSpy.callCount, 1)
})
