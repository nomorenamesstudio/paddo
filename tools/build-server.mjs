/**
 * Bundles the server into one file for the container, so the runtime image needs no
 * tsx, no TypeScript and no package manager: `node dist/server/main.js`.
 *
 * Runs through esbuild's JS API rather than its CLI: the CLI shim is a shell script
 * that hands the file to node, and after esbuild's postinstall the file underneath is
 * the native binary, which node cannot load.
 *
 * `packages: 'external'` keeps every dependency a real import resolved from
 * node_modules at runtime. Bundling node_modules in as well dies on a CommonJS
 * `require('node:zlib')` inside a transitive package.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/server/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  outfile: 'dist/server/main.js',
  logLevel: 'warning',
})

console.log('bundled dist/server/main.js')
