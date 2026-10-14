import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../src/run.mjs'
import { assemblePage, generatedComment } from '../src/page.mjs'
import { makeModule, DESCRIPTOR, sha1 } from './helpers.mjs'

// A fake WikiApi: one page, files by name; edit() stores the text through an optional transform
function fakeApi({ page = { exists: false, title: 'Prune' }, files = {}, transform = text => text } = {}) {
  const calls = []
  let current = page
  return {
    calls,
    async readPage(title) { calls.push(['readPage', title]); return current },
    async fileSha1s(names) { calls.push(['fileSha1s', names]); return new Map(names.map(name => [name, files[name] ?? null])) },
    async parse() { calls.push(['parse']); return '<p>preview</p>' },
    async login(name) { calls.push(['login', name]) },
    async upload(name, data, comment) { calls.push(['upload', name, comment]); files[name] = sha1(data) },
    async edit(args) {
      calls.push(['edit', args])
      current = { exists: true, title: args.title, revid: 2, content: transform(args.text) }
      return { result: 'Success' }
    }
  }
}

const options = api => ({
  modulePath: makeModule(),
  descriptor: DESCRIPTOR,
  out: mkdtempSync(join(tmpdir(), 'wiki-sync-out-')),
  api,
  apiUrl: 'https://wiki.example/api.php',
  repository: 'Net-Logic/dolibarr_module_prune',
  credentials: { login: 'Dolibarr@wikisync', password: 'x' },
  log: () => {}
})
const names = calls => calls.map(call => call[0])

test('dry-run writes the three files and never logs in', async () => {
  const api = fakeApi()
  const opts = options(api)
  const result = await run(opts)
  assert.equal(result.status, 'dry-run')
  assert.equal(result.state, 'missing')
  assert.deepEqual(result.images, { upload: ['logo.png', 'screen.png'], unchanged: [], unused: [] })
  assert.deepEqual(names(api.calls), ['readPage', 'fileSha1s', 'parse'])
  const page = readFileSync(join(opts.out, 'page.wiki'), 'utf8')
  assert.match(page, /\[\[File:Prune-logo\.png\]\]/)
  assert.match(page, /'''Version''' 2\.0\.4/)
  assert.match(page, /\[\[File:Prune-screen\.png\|800px\|Écran\]\]/)
  assert.match(page, /<!-- wiki-sync: sha256=[0-9a-f]{64} -->\n$/)
  assert.match(readFileSync(join(opts.out, 'diff.txt'), 'utf8'), /it will be created/)
  assert.ok(existsSync(join(opts.out, 'preview.html')))
})

test('submit creates a missing page, images first, with a summary naming repo and version', async () => {
  const api = fakeApi()
  const result = await run({ ...options(api), submit: true })
  assert.equal(result.status, 'updated')
  assert.deepEqual(names(api.calls), ['readPage', 'fileSha1s', 'parse', 'login', 'upload', 'upload', 'edit', 'readPage'])
  const edit = api.calls.find(call => call[0] === 'edit')[1]
  assert.equal(edit.baserevid, null)
  assert.equal(edit.summary, 'wiki-sync: Net-Logic/dolibarr_module_prune v2.0.4')
  assert.equal(api.calls.find(call => call[0] === 'upload')[2], 'wiki-sync: Net-Logic/dolibarr_module_prune v2.0.4')
})

test('unchanged images are not uploaded; a re-run after a failure uploads nothing again', async () => {
  const files = { 'Prune-logo.png': sha1(Buffer.from('logo')), 'Prune-screen.png': 'old' }
  const api = fakeApi({ files })
  const result = await run({ ...options(api), submit: true })
  assert.deepEqual(result.images.upload, ['screen.png'])
  assert.deepEqual(result.images.unchanged, ['logo.png'])
  const again = fakeApi({ files, page: { exists: false, title: 'Prune' } })
  const second = await run({ ...options(again), submit: true })
  assert.deepEqual(second.images.upload, [])
})

test('an image used twice is uploaded once', async () => {
  const api = fakeApi()
  const opts = options(api)
  opts.modulePath = makeModule({ 'wiki/fr.md': '![a](images/screen.png)\n\n![b](images/screen.png)\n' })
  await run({ ...opts, submit: true })
  assert.equal(api.calls.filter(call => call[0] === 'upload' && call[1] === 'Prune-screen.png').length, 1)
})

test('images of wiki/images not used by the page are reported, not uploaded', async () => {
  const api = fakeApi()
  const opts = options(api)
  opts.modulePath = makeModule({ 'wiki/images/old.png': Buffer.from('old') })
  const result = await run(opts)
  assert.deepEqual(result.images.unused, ['old.png'])
})

test('a page never synced is refused without force, before any login or upload', async () => {
  const api = fakeApi({ page: { exists: true, title: 'Prune', revid: 140, content: 'hand written' } })
  await assert.rejects(run({ ...options(api), submit: true }), /Refused: the page "Prune" was never synced by wiki-sync.*--force/s)
  assert.deepEqual(names(api.calls), ['readPage', 'fileSha1s', 'parse'])
})

test('force overwrites a page never synced, with baserevid', async () => {
  const api = fakeApi({ page: { exists: true, title: 'Prune', revid: 140, content: 'hand written' } })
  const result = await run({ ...options(api), submit: true, force: true })
  assert.equal(result.status, 'updated')
  assert.equal(api.calls.find(call => call[0] === 'edit')[1].baserevid, 140)
})

test('a page edited by hand after a sync is refused without force', async () => {
  const synced = assemblePage({ comment: generatedComment(null), header: 'H', body: 'B' })
  const api = fakeApi({ page: { exists: true, title: 'Prune', revid: 7, content: synced.replace('B', 'B edited') } })
  await assert.rejects(run({ ...options(api), submit: true }), /edited by hand/)
})

test('an identical page is not edited', async () => {
  const first = fakeApi()
  const opts = options(first)
  await run({ ...opts, submit: true })
  const saved = first.calls.find(call => call[0] === 'edit')[1].text
  const api = fakeApi({ page: { exists: true, title: 'Prune', revid: 2, content: saved }, files: { 'Prune-logo.png': sha1(Buffer.from('logo')), 'Prune-screen.png': sha1(Buffer.from('screen')) } })
  const result = await run({ ...opts, api, submit: true })
  assert.equal(result.status, 'no-change')
  assert.equal(result.state, 'synced')
  assert.ok(!names(api.calls).includes('edit'))
  assert.match(readFileSync(join(opts.out, 'diff.txt'), 'utf8'), /Page text: no change/)
})

test('a text changed by the wiki on save is an error naming the line', async () => {
  const api = fakeApi({ transform: text => text.replace('Le module', 'Le  module') })
  await assert.rejects(run({ ...options(api), submit: true }), /The wiki saved a different text \(first difference at line \d+\)/)
})
