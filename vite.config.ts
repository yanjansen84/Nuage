import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: instalável (celular e computador), abre rápido e mostra alertas de notificação.
    // Só o "casco" do app (HTML, JS, CSS, ícones, fontes) fica em cache. As chamadas ao
    // Supabase NUNCA são guardadas: os dados vêm sempre do servidor, com as permissões (RLS).
    VitePWA({
      registerType: 'autoUpdate',
      // registro por arquivo externo (/registerSW.js): compatível com o CSP, sem script inline
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'icons/badge-96.png'],
      manifest: {
        id: '/',
        name: 'Na.Nu · Gestão da Nuage',
        short_name: 'Na.Nu',
        description: 'Comercial, clientes, contratos, financeiro, projetos e conteúdo da Nuage em um só lugar.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1e1e1e',
        theme_color: '#1e1e1e',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // qualquer rota do app abre offline a partir do index.html em cache
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // clique no alerta do sistema leva à tela da notificação
        importScripts: ['sw-notifications.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
