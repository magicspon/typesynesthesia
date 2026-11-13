import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'

/**
 * Local-only dev server, like code-art's: the tracks are made from a private
 * index, never served beyond this machine.
 */
const config: UserConfig = defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1' },
  build: { modulePreload: false },
})

export default config
