#!/usr/bin/env node
/**
 * Stage the seat as a runtime-only package for a machine that will not build it.
 *
 * A deployed seat needs `lib/` and its bundle metadata; it never needs the
 * build toolchain, the vendored upstream source, or the twenty-odd packages
 * that only exist to be bundled into `lib/client.js`. Shipping them makes the
 * server install resolve a dependency tree it has no use for.
 *
 * Output: .pack/dsh-proton-workspace-seat/
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEAT = join(ROOT, 'packages/workspace-seat')
const OUT = join(ROOT, '.pack/dsh-proton-workspace-seat')

rmSync(join(ROOT, '.pack'), { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
cpSync(join(SEAT, 'lib'), join(OUT, 'lib'), { recursive: true })
cpSync(join(SEAT, 'cordis.patch.yml'), join(OUT, 'cordis.patch.yml'))
// The host resolves locale dictionaries by package name through exports["./locale/*.json"],
// so a deploy without them registers slots that cannot translate anything.
cpSync(join(SEAT, 'vendor/ui-workspace/locale'), join(OUT, 'locale'), { recursive: true })

const pkg = JSON.parse(readFileSync(join(SEAT, 'package.json'), 'utf8'))
delete pkg.devDependencies
delete pkg.scripts
pkg.files = ['lib', 'locale', 'cordis.patch.yml']
pkg.exports = {
  '.': pkg.exports['.'],
  './client': pkg.exports['./client'],
  './locale/*.json': './locale/*.json',
}
writeFileSync(join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

console.log('packed ' + OUT)
