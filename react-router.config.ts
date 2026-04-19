import type { Config } from '@react-router/dev/config'
export default {
  ssr: true,
  future: {
    // biome-ignore lint/style/useNamingConvention: react-router config key
    v8_middleware: true,
  },
} satisfies Config
