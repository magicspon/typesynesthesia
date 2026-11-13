import { defineConfig, type ViteUserConfig } from 'vitest/config'

// Annotated to match the other packages' configs, which the root's
// `isolatedDeclarations` requires (TS9037).
const config: ViteUserConfig = defineConfig({
  test: {
    name: '@tsyn/codesong',
    include: ['test/**/*.test.ts'],
    // The audio tests render whole songs: ~1s locally, up to ~18s on a
    // contended CI runner, well past the 5s default.
    testTimeout: 60_000,
  },
})

export default config
