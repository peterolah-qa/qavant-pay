import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev`: forward /api to the deployed API, so the UI works locally with real data.
    // (Only the dev server – production and `vite preview` are not affected.)
    proxy: {
      '/api': { target: 'https://qavant-pay.netlify.app', changeOrigin: true },
    },
  },
})
