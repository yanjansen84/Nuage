// Carregado pelo service worker do PWA (workbox importScripts).
// Clique no alerta do sistema: volta para a janela do Na.Nu já aberta (ou abre uma)
// direto na tela do assunto. Só aceita caminhos internos do próprio app.
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
