import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHome, renderHome, runHome } from '../src/home.mjs'

const SAMPLE = `title: Accueil
headline: Documentation des modules Net-Logic
intro: "Modules Dolibarr de [Net-Logic](https://www.netlogic.fr)."
groups:
  - heading: Modules
    modules:
      - page: Doli 365
        logo: Doli365-Doli365_250x250.png
        description: E-mails Dolibarr via Microsoft 365
        dolistore: 647
      - page: DoliEsign
        logo: doliesign_250x250.png
        description: Signature électronique
  - heading: Librairie commune
    modules:
      - page: Prune
        name: Librairies Prune
        logo: Prune-prune_250x250.png
        description: Librairies communes
        dolistore: 646
contact: dolibarr@netlogic.fr
`

function homeFile(yaml = SAMPLE) {
  const path = join(mkdtempSync(join(tmpdir(), 'wiki-home-')), 'accueil.yml')
  writeFileSync(path, yaml)
  return path
}

test('loads the home list with defaults', () => {
  const home = loadHome(homeFile())
  assert.equal(home.title, 'Accueil')
  assert.equal(home.groups.length, 2)
  assert.deepEqual(home.groups[0].modules[1], { page: 'DoliEsign', logo: 'doliesign_250x250.png', description: 'Signature électronique', dolistore: null, name: 'DoliEsign' })
  assert.equal(home.groups[1].modules[0].name, 'Librairies Prune')
})

test('home list errors', () => {
  const fails = (yaml, pattern) => assert.throws(() => loadHome(homeFile(yaml)), pattern)
  fails(SAMPLE.replace('contact:', 'contakt:'), /unknown key "contakt"/)
  fails(SAMPLE.replace('        dolistore: 647\n', '        dolistore: 647\n        logos: x.png\n'), /groups\[0\]\.modules\[0\]: unknown key "logos"/)
  fails(SAMPLE.replace('      - page: Doli 365\n', '      - page: "A|B"\n'), /groups\[0\]\.modules\[0\]: invalid page title/)
  fails(SAMPLE.replace('Doli365-Doli365_250x250.png', 'logo.txt'), /groups\[0\]\.modules\[0\]: logo must be an image file name/)
  fails(SAMPLE.replace('dolistore: 647', 'dolistore: "647x"'), /dolistore must be a DoliStore product id/)
  fails(SAMPLE.replace('contact: dolibarr@netlogic.fr', 'contact: nobody'), /contact must be an e-mail address/)
  fails(SAMPLE.replace('      - page: DoliEsign', '      - page: Doli 365'), /page "Doli 365" is listed twice/)
  fails(SAMPLE.replace(/groups:[\s\S]*contact:/, 'groups: []\ncontact:'), /at least one group/)
  fails(SAMPLE.replace('        description: Signature électronique\n', ''), /groups\[0\]\.modules\[1\]: description is required/)
})

test('renders the heading block, one grid per group and the contact', () => {
  const body = renderHome(loadHome(homeFile()))
  assert.match(body, /^<div style="padding:18px 22px;[^"]*">\n<div style="font-size:150%; font-weight:bold;">Documentation des modules Net-Logic<\/div>\n<div style="margin-top:6px;">Modules Dolibarr de \[https:\/\/www\.netlogic\.fr Net-Logic\]\.<\/div>\n<\/div>\n__NOTOC__\n/)
  assert.match(body, /\n== Modules ==\n<div style="display:flex; flex-wrap:wrap; gap:16px; margin:12px 0 24px;">\n/)
  assert.match(body, /\n== Librairie commune ==\n/)
  assert.match(body, /\n== Besoin d'aide \? ==\nÉcrivez à \[mailto:dolibarr@netlogic\.fr dolibarr@netlogic\.fr\]\.$/)
})

test('a card: fixed width, logo linked to the page, name, description, links', () => {
  const body = renderHome(loadHome(homeFile()))
  assert.ok(body.includes([
    '<div style="flex:0 1 280px; box-sizing:border-box; border:1px solid #c8ccd1; border-radius:8px; padding:14px 16px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.08);">',
    '<div style="display:flex; gap:14px; align-items:center;">[[File:Doli365-Doli365_250x250.png|64px|link=Doli 365]]<div style="font-size:115%;">\'\'\'[[Doli 365|Doli 365]]\'\'\'</div></div>',
    '<div style="margin:10px 0 8px;">E-mails Dolibarr via Microsoft 365</div>',
    '<div style="font-size:90%;">[[Doli 365|Documentation]] · [https://www.dolistore.com/product.php?id=647&l=fr DoliStore]</div>',
    '</div>'
  ].join('\n')))
  assert.ok(body.includes('<div style="font-size:90%;">[[DoliEsign|Documentation]]</div>'))
  assert.ok(body.includes("'''[[Prune|Librairies Prune]]'''"))
})

test('intro and descriptions must be one paragraph', () => {
  assert.throws(() => renderHome(loadHome(homeFile(SAMPLE.replace('description: Signature électronique', 'description: "a\\n\\nb"')))), /DoliEsign: description must be a single paragraph/)
})

function fakeApi({ pages = {}, files = {}, page = { exists: false, title: 'Accueil' } } = {}) {
  const calls = []
  let current = page
  return {
    calls,
    async pagesExist(titles) { calls.push(['pagesExist', titles]); return new Map(titles.map(t => [t, pages[t] ?? true])) },
    async fileSha1s(names) { calls.push(['fileSha1s', names]); return new Map(names.map(n => [n, files[n] === undefined ? 'sha' : files[n]])) },
    async readPage() { calls.push(['readPage']); return current },
    async preSaveTransform(title, text) { return text },
    async parse() { return '<p>preview</p>' },
    async login() { calls.push(['login']) },
    async upload() { calls.push(['upload']) },
    async edit(args) { calls.push(['edit', args]); current = { exists: true, title: args.title, revid: 9, content: args.text }; return { result: 'Success' } }
  }
}

const options = api => ({
  homePath: homeFile(), out: mkdtempSync(join(tmpdir(), 'wiki-home-out-')), api, apiUrl: 'https://wiki.example/api.php',
  repository: 'Net-Logic/wiki-sync', sourceUrl: 'https://github.com/Net-Logic/wiki-sync/blob/main/home/accueil.yml',
  credentials: { login: 'Dolibarr@wikisync', password: 'x' }, log: () => {}
})

test('dry-run reports missing pages and logos', async () => {
  const api = fakeApi({ pages: { DoliEsign: false }, files: { 'Prune-prune_250x250.png': null } })
  const opts = options(api)
  const result = await runHome(opts)
  assert.equal(result.status, 'dry-run')
  const report = readFileSync(join(opts.out, 'diff.txt'), 'utf8')
  assert.match(report, /  - wiki page "DoliEsign" does not exist/)
  assert.match(report, /  - logo "File:Prune-prune_250x250\.png" of "Prune" does not exist on the wiki/)
  assert.match(readFileSync(join(opts.out, 'page.wiki'), 'utf8'), /^<!-- Generated by wiki-sync from https:\/\/github\.com\/Net-Logic\/wiki-sync\/blob\/main\/home\/accueil\.yml\./)
})

test('submit refuses missing pages before login', async () => {
  const api = fakeApi({ pages: { DoliEsign: false } })
  await assert.rejects(runHome({ ...options(api), submit: true }), /Refused: wiki page "DoliEsign" does not exist/)
  assert.ok(!api.calls.some(call => call[0] === 'login'))
})

test('submit creates the home page with a summary, uploads nothing', async () => {
  const api = fakeApi()
  const result = await runHome({ ...options(api), submit: true })
  assert.equal(result.status, 'updated')
  const edit = api.calls.find(call => call[0] === 'edit')[1]
  assert.equal(edit.title, 'Accueil')
  assert.equal(edit.summary, 'wiki-sync: Net-Logic/wiki-sync home page')
  assert.ok(!api.calls.some(call => call[0] === 'upload'))
})
