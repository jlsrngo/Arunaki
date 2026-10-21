import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// No cwd: git searches upward itself, so this works whether vite is invoked from the repo
// root or from apps/web. Shortcut: reading git at config load assumes a .git is reachable -
// a source tarball build falls back to "unknown" rather than failing.
const git = (cmd: string) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@tanstack/react-query',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'react-markdown',
      'remark-gfm',
      '@xyflow/react',
      'xlsx',
    ],
  },
  // Injected so the About dialog reports the code it actually shipped with. It used to
  // display three hand-typed literals that had been sitting there since 2026-09-26.
  define: {
    __ARUNAKI_COMMIT__: JSON.stringify(git('git rev-parse HEAD')),
    __ARUNAKI_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __ARUNAKI_VERSION__: JSON.stringify(
      // Root package.json carries no version today, so this reports "0.0.0" - the same value
      // apps/web and apps/desktop declare - rather than the "0.1.0" that was only ever a guess.
      JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'))
        .version || '0.0.0',
    ),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    },
    proxy: {
      '/session': {
        target: 'http://127.0.0.1:4096',
        changeOrigin: true,
      },
      '/api/messaging': {
        target: 'http://127.0.0.1:4096',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/messaging/, '/messaging'),
      },
      '/api': {
        target: 'http://127.0.0.1:4096',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
          'vendor-xlsx': ['xlsx'],
          'vendor-xyflow': ['@xyflow/react'],
          'vendor-markdown': ['react-markdown'],
        },
      },
    },
  },
})
