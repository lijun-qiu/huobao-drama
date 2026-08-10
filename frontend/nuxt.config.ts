export default defineNuxtConfig({
  srcDir: 'app/',
  ssr: false,
  devtools: { enabled: false },
  experimental: {
    appManifest: false,
  },
  app: {
    head: {
      title: '火宝短剧',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'shortcut icon', type: 'image/png', href: '/favicon.png' },
      ],
    },
  },
  vite: {
    optimizeDeps: {
      include: ['@webav/av-canvas', '@webav/av-cliper'],
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5679',
          changeOrigin: true,
          timeout: 3_600_000,
          proxyTimeout: 3_600_000,
        },
        '/static': { target: 'http://localhost:5679', changeOrigin: true },
      },
    },
  },
  build: {
    transpile: ['@webav/av-canvas', '@webav/av-cliper'],
  },
  compatibilityDate: '2025-05-15',
})
