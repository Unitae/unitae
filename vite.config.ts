import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: './app/i18n/project.inlang',
      outdir: './app/i18n/paraglide',
    }),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // @googlemaps/markerclusterer ships a CommonJS main entry; bundle it for SSR so
  // Vite picks the ESM `module` field and named imports resolve correctly.
  ssr: {
    noExternal: ['@googlemaps/markerclusterer'],
  },
})
