/* eslint-env: serviceworker */
/* global caches */

// When sessionTimer expires, send inactivity message to main thread
// Main tread check if user has been inactive (https://css-tricks.com/detecting-inactive-users/, https://stackoverflow.com/questions/1060008/is-there-a-way-to-detect-if-a-browser-window-is-not-currently-active)
// Run in main thread (w/ throttling), sync between tabs using sessionStorage
// if active: re-new token with GET /api/auth
// if inactive: prompt with modal to reactivate

// BEGIN Session Management
// Phase I: infinite session length
// Phase II: persist after update (save in cache?)
// Phase III: finite session length

import {
  addHeaderToRequest,
  addHeaderToResponse,
  deleteHeaderFromResponse,
  isResponse,
  postMethod,
  postMessageToFocused
} from '@work-bee/core'

const headerAuthorization = 'Authorization'
const sessionMiddleware = ({
  // Create Session
  authnMethods,
  authnPathPattern,
  authnGetToken,
  // Session Management
  authnGetExpiry,
  expiryPromptEventType,
  renewPath,
  authzPathPattern,
  postMessage,
  //  Destroy Session
  clearPathPattern,
  clearSiteData,
  expiryEventType
}) => {
  authnMethods ??= [postMethod]
  authnGetToken ??= (response) => {
    // const body = await response.json()
    return response.headers.get(headerAuthorization)
  }
  authnGetExpiry ??= (response, token) => {
    // jwt JSON.parse(atob(token.split('.')[1])).expires_at
    // paseto JSON.parse(atob(token.split('.')[2])).exp
    return 15 * 60
  }
  postMessage ??= postMessageToFocused

  let sessionToken = ''
  let sessionCaches = {}

  let before, afterNetwork, after

  if (authzPathPattern) {
    before = (request, event, config) => {
      if (authzPathPattern.test(request.url)) {
        request = addHeaderToRequest(request, headerAuthorization, sessionToken)
      }
      return request
    }
    after = (request, response, event, config) => {
      activityEvent()
      if (authzPathPattern.test(request.url)) {
        sessionCaches[config.cacheKey] ??= true
      }
      return response
    }
  }

  if (authnPathPattern || clearPathPattern) {
    afterNetwork = async (request, response, event, config) => {
      if (isResponse(response)) {
        if (
          authnMethods.includes(request.method) &&
          authnPathPattern.test(request.url)
        ) {
          sessionToken = await authnGetToken(response.clone())
          sessionExpiresInMiliseconds = await authnGetExpiry(
            response.clone(),
            sessionToken
          )
          activityTimer()
          sessionTimer()
          // Remove Authorization from response
          response = deleteHeaderFromResponse(response, headerAuthorization)
        } else if (clearPathPattern.test(request.url)) {
          if (clearSiteData !== false) {
            response = addHeaderToResponse(
              response,
              'Clear-Site-Data',
              clearSiteData ?? '"*"'
            )
          }
          clearSession()
        }
      }
      return response
    }
  }

  let sessionExpiresInMiliseconds
  let recentActivityTimestamp = 0

  let activityTimeout
  const activityTimer = () => {
    // 60 sec for time before expire to notify
    activityTimeout = setTimeout(
      expiryPromptEvent,
      recentActivityTimestamp +
        sessionExpiresInMiliseconds -
        60 * 1000 -
        Date.now()
    )
  }
  let sessionTimeout
  const sessionTimer = () => {
    // 5 sec for time to renew session
    sessionTimeout = setTimeout(async () => {
      if (
        recentActivityTimestamp <
        Date.now() - sessionExpiresInMiliseconds - 5 * 1000
      ) {
        await fetch(renewPath)
      } else {
        clearSession()
        if (expiryEventType) {
          postMessage({ type: expiryEventType })
        }
      }
    }, sessionExpiresInMiliseconds - 5 * 1000)
  }

  const clearSession = () => {
    sessionToken = ''
    for (const cacheFullName of Object.keys(sessionCaches)) {
      caches.delete(cacheFullName)
    }
    sessionCaches = {}
    clearTimeout(activityTimeout)
    clearTimeout(sessionTimeout)
  }

  // Page -> sw
  const activityEvent = () => {
    recentActivityTimestamp = Date.now()
  }
  activityEvent()

  // sw -> Page
  const expiryPromptEvent = () => {
    if (
      recentActivityTimestamp <
      Date.now() - sessionExpiresInMiliseconds + 60 * 1000
    ) {
      if (expiryPromptEventType) {
        postMessage({ type: expiryPromptEventType })
      }
    } else {
      activityTimer()
    }
  }

  return { before, afterNetwork, after, activityEvent }
}

export default sessionMiddleware
