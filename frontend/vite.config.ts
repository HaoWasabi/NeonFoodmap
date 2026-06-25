import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const publicOrigin = env.DEV_PUBLIC_ORIGIN?.trim().replace(/\/$/, '') || ''

  const server: import('vite').UserConfig['server'] = {
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev'],
  }

  // When you open the app as http://PUBLIC_IP:5173, Vite otherwise still emits
  // localhost URLs for /@vite/client and HMR — the browser then loads from your
  // machine's localhost, not the server. Set DEV_PUBLIC_ORIGIN to match the URL
  // you use in the browser (same host:port as the dev server).
  if (publicOrigin) {
    try {
      const u = new URL(publicOrigin)
      server.origin = publicOrigin
      const port = u.port ? parseInt(u.port, 10) : u.protocol === 'https:' ? 443 : 80
      server.hmr = {
        host: u.hostname,
        port,
        protocol: u.protocol === 'https:' ? 'wss' : 'ws',
      }
    } catch {
      /* ignore invalid DEV_PUBLIC_ORIGIN */
    }
  }

  return {
    plugins: [react()],
    server,
  }
})
