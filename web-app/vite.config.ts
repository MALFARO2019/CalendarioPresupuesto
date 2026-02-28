import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'LogoRosti.png'],
      manifest: {
        name: 'KPIs Rosti',
        short_name: 'KPIsRosti',
        description: 'Plataforma de análisis de métricas para restaurantes',
        theme_color: '#4f46e5',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/LogoRosti.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/LogoRosti.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/LogoRosti.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
