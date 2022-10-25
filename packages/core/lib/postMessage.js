/* eslint-env: serviceworker */
/* global clients */
export const postMessageToAll = async (message) => {
  await clients.claim()
  clients
    .matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clients) =>
      clients.forEach((client) => {
        client.postMessage(message)
      })
    )
}

export const postMessageToFocused = async (message) => {
  await clients.claim()
  clients
    .matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clients) => {
      const focused = clients.some((client) => client.focused)
      if (focused) {
        focused.postMessage(message)
      } else if (clients.length) {
        clients[0].postMessage(message)
      }
    })
}

/* const bc = new BroadcastChannel('sw')
export const postMessageChannel = async (message) => {
  bc.postMessage(message)
} */
