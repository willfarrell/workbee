/* eslint-env: serviceworker */
import { headersGetAll, consoleLog } from '@work-bee/core'
const defaults = {
  logger: (when, request, response, event, config) => {
    consoleLog(when, request.url, config.strategy.name, {
      request,
      requestHeaders: headersGetAll(request.headers),
      response,
      responseHeaders: headersGetAll(response?.headers),
      config
    })
  },
  runOnBefore: true,
  runOnBeforeNetwork: true,
  runOnAfterNetwork: true,
  runOnAfter: true
}
const loggerMiddleware = (opts = {}) => {
  const options = { ...defaults, ...opts }

  const beforeMiddleware = (when) => {
    return (request, event, config) => {
      options.logger(when, request, undefined, event, config)
      return request
    }
  }
  const before = options.runOnBefore && beforeMiddleware('before')
  const beforeNetwork =
    options.runOnAfterNetwork && beforeMiddleware('beforeNetwork')

  const afterMiddleware = (when) => {
    return (request, response, event, config) => {
      options.logger(when, request, response, event, config)
      return response
    }
  }
  const afterNetwork =
    options.runOnAfterNetwork && afterMiddleware('afterNetwork')
  const after = options.runOnAfter && afterMiddleware('after')
  return { before, beforeNetwork, afterNetwork, after }
}
export default loggerMiddleware
