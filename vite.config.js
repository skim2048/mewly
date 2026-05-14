import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const babycatHost = env.VITE_BABYCAT_HOST || env.HOST_IP || '192.168.0.10'
  const babycatApiUrl = `http://${babycatHost}:8000`
  const babycatAppUrl = `http://${babycatHost}:8080`

  return {
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5177,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': babycatApiUrl,
        '/clips': babycatApiUrl,
        '/camera': babycatApiUrl,
        '/events': babycatAppUrl,
        '/prompt': babycatAppUrl,
        '/ptz': babycatAppUrl,
        '/vlm': babycatAppUrl,
      },
    },
  }
})
