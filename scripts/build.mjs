import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

mkdirSync(join(ROOT, 'dist'), { recursive: true })

await build({
  entryPoints: [join(ROOT, 'src', 'index.ts')],
  outfile: join(ROOT, 'dist', 'index.js'),
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: true,
  // puppeteer-core and @puppeteer/browsers stay external — they have
  // native binaries and are installed as regular deps when the user
  // runs `npm install` (or `npx` pulls them).
  external: ['puppeteer-core', '@puppeteer/browsers'],
  sourcemap: false,
  minify: false,
  keepNames: true,
})

console.log('Built dist/index.js')
