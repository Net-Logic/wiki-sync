import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeModule, DESCRIPTOR } from './helpers.mjs'

const BIN = fileURLToPath(new URL('../bin/wiki-sync.mjs', import.meta.url))
const cli = (args, env = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } })

test('--help prints the usage', () => {
  const result = cli(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /^Usage: wiki-sync --descriptor/)
})

test('--descriptor is required', () => {
  const result = cli([])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /wiki-sync: --descriptor is required/)
})

test('--submit without credentials fails before any network call', () => {
  const result = cli(['--module', makeModule(), '--descriptor', DESCRIPTOR, '--submit', '--api', 'http://127.0.0.1:9/api.php'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--submit needs WIKI_LOGIN and WIKI_PASSWORD/)
})

test('an invalid fr.md fails before any network call', () => {
  const dir = makeModule({ 'wiki/fr.md': '- [ ] todo\n' })
  const result = cli(['--module', dir, '--descriptor', DESCRIPTOR, '--api', 'http://127.0.0.1:9/api.php'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /fr\.md line 1: task list/)
})

test('an unknown option is refused', () => {
  const result = cli(['--descriptor', DESCRIPTOR, '--dry-run'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unknown option '--dry-run'/)
})
