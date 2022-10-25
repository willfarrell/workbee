/* eslint-env: serviceworker */
/* global Headers Request Response */
export const headersGetAll = (headersObj) => {
  const headers = {}
  if (!headersObj) return headers
  for (const [key, value] of headersObj.entries() ?? []) {
    headers[key] = value
  }
  return headers
}

export const urlRemoveHash = (url) => {
  const urlObj = new URL(url)
  urlObj.hash = ''
  return urlObj.toString()
}

export const isRequest = (response) => response instanceof Request
export const newRequest = (url, options) => new Request(url, options)

export const addHeaderToRequest = (request, key, value) => {
  const headers = new Headers(headersGetAll(request.headers))
  headers.set(key, value)
  return newRequest(request.url, { ...request, headers })
}

export const isResponse = (response) => response instanceof Response
export const newResponse = ({ status, url, body }, headersObj) => {
  const headers = headersGetAll(headersObj)
  headers.date ??= new Date().toString()
  const response = new Response(body, { status, headers })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

export const addHeaderToResponse = (response, key, value) => {
  const headers = new Headers(headersGetAll(response.headers))
  headers.set(key, value)
  return newResponse(response, headers)
}

export const deleteHeaderFromResponse = (response, key, value) => {
  const headers = new Headers(headersGetAll(response.headers))
  headers.delete(key)
  return newResponse(response, headers)
}

export const getMethod = 'GET'
export const postMethod = 'POST'
export const putMethod = 'PUT'
export const patchMethod = 'PATCH'
export const deleteMethod = 'DELETE'
export const headMethod = 'HEAD'
export const optionsMethod = 'OPTIONS'
