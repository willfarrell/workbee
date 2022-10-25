/* eslint-env: serviceworker */
import { strategyCacheOnly } from '@workbee/core'

const saveDataMiddleware = ({ saveDataStrategy } = {}) => {
  const before = (request, event, config) => {
    const saveData = request.headers.get('Save-Data') === 'on'
    if (saveData) {
      config.strategy = saveDataStrategy ?? strategyCacheOnly
    }
    return request
  }
  return { before }
}
export default saveDataMiddleware
