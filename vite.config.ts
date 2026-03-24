import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import adonisjs from '@adonisjs/vite/client'
import inertia from '@adonisjs/inertia/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(import.meta.dirname, 'inertia'),
    },
  },
  plugins: [
    inertia({ ssr: { enabled: false } }),
    react(),
    tailwindcss(),
    adonisjs({
      entrypoints: ['inertia/app/app.tsx'],
      reload: ['resources/views/**/*.edge'],
    }),
  ],
})
