// node scripts/check-converter.mjs - the web app converts with @pnfo/pali-converter (npm), the server with its Go port in
// the submodule server/pali-converter (checked against its index.js by the golden tests there). Both must be the same
// converter: fails when the submodule is missing or its index.js is not the one of the npm package.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sub = path.join(repo, 'server/pali-converter')
if (!fs.existsSync(path.join(sub, 'go.mod'))) {
  console.error('server/pali-converter is missing: git submodule update --init server/pali-converter')
  process.exit(1)
}
const require = createRequire(import.meta.url)
const npmJs = fs.readFileSync(path.join(path.dirname(require.resolve('@pnfo/pali-converter/package.json')), 'index.js'), 'utf8')
if (fs.readFileSync(path.join(sub, 'index.js'), 'utf8') !== npmJs) {
  const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'))
  console.error(`server/pali-converter/index.js differs from the npm @pnfo/pali-converter (${lock.packages['node_modules/@pnfo/pali-converter']?.resolved}):
update the submodule (cd server/pali-converter && git checkout <commit>) or the npm dependency, so that both are the same converter`)
  process.exit(1)
}
console.log('server/pali-converter: same index.js as the npm @pnfo/pali-converter')
