import { defineConfig, type UserConfig } from 'tsdown'

/**
 * The published artefact: one bundled ESM entry point with a shebang.
 *
 * Node refuses to strip types anywhere inside `node_modules`
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), on both the import path and
 * the `bin` path, so shipping `src/*.ts` would produce a package that can be
 * neither imported nor executed. A build is forced rather than chosen (#73).
 */
const config: UserConfig = defineConfig({
  entry: ['src/bin.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: {
    // `@tsyn/core` is bundled in, not depended on. Publishing the CLI alone
    // keeps core's exports from becoming a public API with a compatibility
    // promise, and a `workspace:*` dependency would not resolve for a consumer.
    // CodeSong's MP3 encoder (lamejs, pure JavaScript) comes in with it.
    alwaysBundle: ['@tsyn/core', '@tsyn/code-art', '@tsyn/codesong'],
    // `typescript` ships two JS shims around a Go binary; bundling the shims
    // separates them from the binary they spawn.
    neverBundle: ['typescript'],
  },
  // `tsyn art`'s viewer: one self-contained page, built by
  // `@tsyn/code-art`'s own `build` before this one runs.
  copy: [
    {
      from: '../../apps/code-art/dist/index.html',
      to: 'dist/art',
      rename: 'viewer.html',
    },
  ],
  // `.js`, not tsdown's default `.mjs`: the package is `"type": "module"`, so
  // the extension would only restate what the manifest already says.
  outExtensions: () => ({ js: '.js' }),
  // ADR 0011 keeps the tsyn frames of a stack. Bundling would collapse them
  // all onto one file, so the map is what keeps a bug report diagnosable.
  sourcemap: true,
  // No `.d.ts`: nothing is importable, so there is no type surface to emit.
  dts: false,
  clean: true,
})

export default config
