import path from "path"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// Resolve each requested icon to its public subpath. The package's root barrel
// otherwise puts every route's icons together and transfers 6 MB in dev mode.
function directIconImports(): Plugin {
  const require = createRequire(import.meta.url)
  const root = path.dirname(require.resolve('@hugeicons/core-free-icons/package.json'))
  const source = readFileSync(path.join(root, 'dist/esm/index.js'), 'utf8')
  const modules = new Map<string, string>()
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)\.js'/g)) {
    for (const alias of match[1].matchAll(/default as (\w+)/g)) modules.set(alias[1], match[2])
  }
  return {
    name: 'direct-hugeicon-imports', enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || !code.includes('@hugeicons/core-free-icons')) return null
      const transformed = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]@hugeicons\/core-free-icons['"];?/g, (original, names: string) => {
        const imports = names.split(',').map((name) => name.trim()).filter(Boolean).map((name) => name.split(/\s+as\s+/))
        if (imports.some(([name]) => !modules.has(name))) return original
        return imports.map(([name, local]) => `import ${local || name} from '@hugeicons/core-free-icons/${modules.get(name)}';`).join('\n')
      })
      return transformed === code ? null : { code: transformed, map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [directIconImports(), react()],
  optimizeDeps: { exclude: ['@hugeicons/core-free-icons'] },
  build: {
    rollupOptions: {
      output: {
        // Tiny shared glyph chunks otherwise add many requests to each route.
        manualChunks(id, { getModuleInfo }) {
          if (!id.includes('/node_modules/@hugeicons/core-free-icons/') || (getModuleInfo(id)?.importers.length ?? 0) < 2) return
          const pending = [id], seen = new Set<string>()
          while (pending.length) {
            const current = pending.pop()!
            if (seen.has(current)) continue
            seen.add(current)
            const info = getModuleInfo(current)
            // Keep initial-screen glyphs in the initial bundle. Only combine
            // the shared glyphs that belong to subsequently opened routes.
            if (info?.isEntry) return
            pending.push(...(info?.importers ?? []))
          }
          return 'icons'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7090',
        changeOrigin: true,
      },
      '/_': {
        target: 'http://127.0.0.1:7090',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
