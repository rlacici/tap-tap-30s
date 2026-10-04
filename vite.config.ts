import { defineConfig } from 'vite'

// Set VITE_BASE=/repo-name/ when deploying to GitHub Pages project sites.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4732,
    strictPort: true,
  },
})
