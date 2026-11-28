// Carregado pelo service worker do PWA (workbox importScripts).
// 1. push: exibe notificação recebida em segundo plano (Web Push).
// 2. notificationclick: volta para a janela do Na.Nu já aberta (ou abre uma)
//    direto na tela do assunto. Só aceita caminhos internos do próprio app.
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = { title: event.data?.text() } }
  const title = payload.title || 'Na.Nu'
  const link = typeof payload.link === 'string' && /^\/([^/]|$)/.test(payload.link) ? payload.link : '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.tag || undefined,
      data: { link },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  const url = new URL(link, self.location.origin)
  if (url.origin !== self.location.origin) return

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue
      await client.focus()
      if ('navigate' in client) await client.navigate(url.href)
      return
    }
    await self.clients.openWindow(url.href)
  })())
})
