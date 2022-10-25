/* eslint-env: serviceworker */
/* global indexedDB */
import {
  headersGetAll,
  postMessageToFocused,
  newRequest,
  isResponse,
  newResponse,
  consoleError,
  postMethod,
  putMethod,
  patchMethod,
  deleteMethod
} from '@workbee/core'

const offlineMiddleware = ({
  methods,
  statusCodes,
  pollDelay,
  postMessage,
  enqueueEventType,
  quotaExceededEventType,
  dequeueEventType,
  objectStoreName
} = {}) => {
  statusCodes ??= [
    503, // Service Unavailable
    504 // Gateway Timeout
  ]
  pollDelay ??= 1 * 60 * 1000
  postMessage ??= postMessageToFocused
  objectStoreName ??= 'offline'

  // Enqueue and Retry submitted data
  const afterNetwork = async (request, response, event, config) => {
    if (
      ![postMethod, putMethod, patchMethod, deleteMethod].includes(
        request.method
      )
    ) {
      return response
    }
    if (isResponse(response) && !statusCodes.includes(response.status)) {
      return response
    }

    event.waitUntil(enqueue(request))

    return newResponse({ status: 202 })
  }

  let cursor, timer
  const timeout = () => {
    if (pollDelay > 0) {
      timer = setTimeout(onlineEvent, pollDelay)
    }
  }

  let idbDatabase, idbTransaction, idbObjectStore
  const idbOpenRequest = indexedDB.open('sw', 1)
  idbOpenRequest.onerror = (e) => {
    consoleError(e)
  }
  idbOpenRequest.onupgradeneeded = () => {
    idbDatabase ??= idbOpenRequest.result
    idbDatabase.createObjectStore(objectStoreName, { autoIncrement: true })
    console.log('onupgradeneeded')
  }
  idbOpenRequest.onsuccess = () => {
    idbDatabase ??= idbOpenRequest.result
    console.log('onsuccess')
  }

  const idbCursor = () =>
    new Promise((resolve, reject) => {
      idbStartTransaction()
      idbObjectStore.openCursor().onsuccess = (event) =>
        resolve(event?.target?.result)
    })

  const idbStartTransaction = () => {
    idbTransaction = idbDatabase.transaction([objectStoreName], 'readwrite')
    idbObjectStore = idbTransaction.objectStore(objectStoreName)
  }

  const enqueue = async (request) => {
    const serialized = await idbSerializeRequest(request)
    // Catch attempts to add in a duplicate
    cursor = await idbCursor()
    if (JSON.stringify(cursor?.value) !== JSON.stringify(serialized)) {
      if (enqueueEventType) {
        postMessage({ type: enqueueEventType, ...serialized })
      }
      idbStartTransaction()
      try {
        idbObjectStore.add(serialized)
      } catch (e) {
        consoleError(e)
        // https://github.com/dumbmatter/fakeIndexedDB/issues/51
        if (e.name === 'QuotaExceededError') {
          if (quotaExceededEventType) {
            postMessage({ type: quotaExceededEventType })
          }
        }
        // TODO backoff timerer to retry add
        // idbObjectStore.add(serialized)
      }
    }
    if (!cursor) {
      timeout()
    }
  }

  const onlineEvent = async () => {
    clearTimeout(timer)
    if (!navigator.onLine) {
      return timeout()
    }
    cursor = await idbCursor()
    if (cursor) {
      const response = await fetch(idbDeserializeRequest(cursor.value))
      if (!statusCodes.includes(response.status)) {
        cursor = await idbCursor()
        cursor.delete()
        cursor.continue()
        if (dequeueEventType) {
          postMessage({ type: dequeueEventType, ...cursor.value })
        }
        return onlineEvent()
      } else {
        timeout()
      }
    }
  }

  return { afterNetwork, onlineEvent }
}

export default offlineMiddleware

// *** IndexedDB *** //
// Protects against the browser closing for offline queues and retries
// Storing requests in IndexedDB has risks of exposing PII

export const idbSerializeRequest = async (request) => {
  // TODO test using ...request instead
  const properties = {}
  for (const property of [
    'method',
    'url',
    'referrer',
    'referrerPolicy',
    'mode',
    'credentials',
    'cache',
    'integrity',
    'keepalive',
    'redirect'
  ]) {
    if (request[property] !== undefined) {
      properties[property] = request[property]
    }
  }
  const body = request.body && (await request.clone().text())
  const headers = headersGetAll(request.headers)
  return {
    ...properties,
    headers,
    body
  }
}

export const idbDeserializeRequest = (data) => {
  return newRequest(data.url, data)
}

/*
// Alt attempt to avoid timers and messageEvents

let onLine = navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  get() {
    console.log('get', onLine)
    return onLine
  },
  set(value) {
    console.log('set', value)
    if (value) onlineEvent()
    onLine = value
  }
})
navigator.onLine = onLine
*/
