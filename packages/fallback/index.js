/* eslint-env: serviceworker */
import {
  fetchInlineStrategy,
  strategyCacheFirst,
  newRequest,
  isResponse
} from '@workbee/core'

const fallbackMiddleware = ({
  pathPattern,
  path,
  statusCodes,
  fallbackStrategy
} = {}) => {
  const after = async (request, response, event, config) => {
    if (response?.ok) {
      return response
    }
    const typeResponse = isResponse(response)
    if (typeResponse && !statusCodes?.includes(response.status)) {
      return response
    }
    config.strategy = fallbackStrategy ?? strategyCacheFirst
    let url = path
    if (pathPattern) {
      url = request.url.replace(pathPattern, path)
    }
    if (typeResponse) {
      url = url.replace('{status}', response.status)
    }
    return fetchInlineStrategy(
      newRequest({ ...request, url }, request.headers),
      event,
      config
    )
  }
  return { after }
}
export default fallbackMiddleware
