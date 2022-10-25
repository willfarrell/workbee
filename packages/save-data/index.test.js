/* global Headers Request */
import test from 'node:test'
import { deepEqual } from 'node:assert'
import { domain, setupMocks } from '../../test-unit/helper.js'
import { strategyNetworkFirst, strategyCacheOnly } from '../core/index.js'
import saveDataMiddleware from './index.js'

test('saveDataMiddleware.before: Should skip when Save-Data header not set', async (t) => {
  const request = new Request(`${domain}/200`, {
    method: 'GET',
    headers: new Headers({})
  })

  const saveData = saveDataMiddleware({
    saveDataStrategy: strategyCacheOnly
  })
  const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`)
  await saveData.before(request, event, config)

  deepEqual(config.strategy, strategyNetworkFirst)
})

test('saveDataMiddleware.before: Should skip when Save-Data header not set', async (t) => {
  const request = new Request(`${domain}/200`, {
    method: 'GET',
    headers: new Headers({ 'Save-Data': 'on' })
  })

  const saveData = saveDataMiddleware({
    saveDataStrategy: strategyCacheOnly
  })
  const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`)
  await saveData.before(request, event, config)

  deepEqual(config.strategy, strategyCacheOnly)
})

test('saveDataMiddleware.before: Should skip when Save-Data header not set (no options)', async (t) => {
  const request = new Request(`${domain}/200`, {
    method: 'GET',
    headers: new Headers({ 'Save-Data': 'on' })
  })

  const saveData = saveDataMiddleware()
  const { event, config } = setupMocks(strategyNetworkFirst, `${domain}/200`)
  await saveData.before(request, event, config)

  deepEqual(config.strategy, strategyCacheOnly)
})
