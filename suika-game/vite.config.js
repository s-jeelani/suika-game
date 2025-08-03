import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        lobby: 'lobby.js',
        game: 'game.js'
      },
      output: {
        manualChunks: undefined,
        entryFileNames: '[name].js'
      }
    },
    copyPublicDir: true
  },
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
  publicDir: 'public',
  server: {
    port: 5173,
    host: true
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  }
}) 