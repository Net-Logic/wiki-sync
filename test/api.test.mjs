import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WikiApi } from '../src/api.mjs'

function fakeFetch(handler) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const params = init.body ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `<file ${v.name}>`])) : Object.fromEntries(new URL(url).searchParams)
    calls.push({ method: init.method ?? 'GET', params, cookie: init.headers?.Cookie ?? null, userAgent: init.headers?.['User-Agent'] })
    const { body, cookies = [], status = 200 } = handler(params)
    return { ok: status === 200, status, headers: { getSetCookie: () => cookies }, json: async () => body }
  }
  return { fetch, calls }
}

const API = 'https://wiki.example/api.php'

test('every request asks for JSON formatversion 2 and sends a User-Agent', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: { query: { pages: [{ title: 'Prune', missing: true }] } } }))
  await new WikiApi({ apiUrl: API, fetch }).readPage('Prune')
  assert.equal(calls[0].params.format, 'json')
  assert.equal(calls[0].params.formatversion, '2')
  assert.match(calls[0].userAgent, /^wiki-sync/)
})

test('API errors and HTTP errors throw', async () => {
  const api = new WikiApi({ apiUrl: API, fetch: fakeFetch(() => ({ body: { error: { code: 'badtoken', info: 'Invalid CSRF token.' } } })).fetch })
  await assert.rejects(api.readPage('Prune'), /Wiki API query: badtoken: Invalid CSRF token\./)
  const down = new WikiApi({ apiUrl: API, fetch: fakeFetch(() => ({ status: 502, body: {} })).fetch })
  await assert.rejects(down.readPage('Prune'), /HTTP 502/)
})

test('login sends the login token with the session cookie, then fetches the CSRF token', async () => {
  const { fetch, calls } = fakeFetch(params => {
    if (params.action === 'query' && params.type === 'login') return { body: { query: { tokens: { logintoken: 'LT+\\' } } }, cookies: ['wiki_session=abc; path=/; HttpOnly'] }
    if (params.action === 'login') return { body: { login: { result: 'Success', lgusername: 'Dolibarr' } } }
    return { body: { query: { tokens: { csrftoken: 'CT+\\' } } } }
  })
  const api = new WikiApi({ apiUrl: API, fetch })
  await api.login('Dolibarr@wikisync', 'secret')
  assert.equal(calls[1].method, 'POST')
  assert.deepEqual([calls[1].params.lgname, calls[1].params.lgpassword, calls[1].params.lgtoken], ['Dolibarr@wikisync', 'secret', 'LT+\\'])
  assert.equal(calls[1].cookie, 'wiki_session=abc')
  assert.equal(api.csrf, 'CT+\\')
})

test('a refused login throws with the reason', async () => {
  const { fetch } = fakeFetch(params => params.action === 'login'
    ? { body: { login: { result: 'Failed', reason: 'Incorrect password' } } }
    : { body: { query: { tokens: { logintoken: 'LT' } } } })
  await assert.rejects(new WikiApi({ apiUrl: API, fetch }).login('a', 'b'), /Wiki login refused: Failed \(Incorrect password\)/)
})

test('readPage returns content and revision id', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: { query: { pages: [{ title: 'Prune', revisions: [{ revid: 140, slots: { main: { content: 'text' } } }] }] } } }))
  assert.deepEqual(await new WikiApi({ apiUrl: API, fetch }).readPage('Prune'), { exists: true, title: 'Prune', revid: 140, content: 'text' })
  assert.equal(calls[0].params.rvslots, 'main')
})

test('readPage of an invalid title throws', async () => {
  const { fetch } = fakeFetch(() => ({ body: { query: { pages: [{ title: 'A|B', invalid: true, invalidreason: 'bad char' }] } } }))
  await assert.rejects(new WikiApi({ apiUrl: API, fetch }).readPage('A|B'), /Invalid wiki page title "A\|B": bad char/)
})

test('fileSha1s maps names through the wiki title normalization', async () => {
  const { fetch, calls } = fakeFetch(() => ({
    body: {
      query: {
        normalized: [
          { from: 'File:Prune-screen_1.png', to: 'Fichier:Prune-screen 1.png' },
          { from: 'File:Prune-new.png', to: 'Fichier:Prune-new.png' }
        ],
        pages: [
          { title: 'Fichier:Prune-new.png', missing: true, imagerepository: '' },
          { title: 'Fichier:Prune-screen 1.png', imageinfo: [{ sha1: 'abc123' }] }
        ]
      }
    }
  }))
  const result = await new WikiApi({ apiUrl: API, fetch }).fileSha1s(['Prune-screen_1.png', 'Prune-new.png'])
  assert.deepEqual([...result], [['Prune-screen_1.png', 'abc123'], ['Prune-new.png', null]])
  assert.equal(calls[0].params.titles, 'File:Prune-screen_1.png|File:Prune-new.png')
})

test('fileSha1s asks 50 titles at most per request', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: { query: { pages: [] } } }))
  const names = Array.from({ length: 120 }, (_, i) => `f${i}.png`)
  await new WikiApi({ apiUrl: API, fetch }).fileSha1s(names)
  assert.equal(calls.length, 3)
})

test('upload posts the file with the CSRF token and ignorewarnings', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: { upload: { result: 'Success' } } }))
  const api = new WikiApi({ apiUrl: API, fetch })
  api.csrf = 'CT'
  await api.upload('Prune-screen.png', Buffer.from('png'), 'wiki-sync: prune v1')
  assert.deepEqual(calls[0].params, {
    action: 'upload', filename: 'Prune-screen.png', comment: 'wiki-sync: prune v1', ignorewarnings: '1', token: 'CT',
    format: 'json', formatversion: '2', file: '<file Prune-screen.png>'
  })
})

test('an upload with warnings only throws', async () => {
  const { fetch } = fakeFetch(() => ({ body: { upload: { result: 'Warning', warnings: { duplicate: ['x.png'] } } } }))
  await assert.rejects(new WikiApi({ apiUrl: API, fetch }).upload('a.png', Buffer.from('x'), 'c'), /Upload of a\.png failed/)
})

test('edit of an existing page sends baserevid and nocreate, a new page createonly', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: { edit: { result: 'Success' } } }))
  const api = new WikiApi({ apiUrl: API, fetch })
  api.csrf = 'CT'
  await api.edit({ title: 'Prune', text: 'T', summary: 'S', baserevid: 140 })
  await api.edit({ title: 'New', text: 'T', summary: 'S', baserevid: null })
  assert.equal(calls[0].params.baserevid, '140')
  assert.equal(calls[0].params.nocreate, '1')
  assert.equal(calls[0].params.createonly, undefined)
  assert.equal(calls[0].params.bot, '1')
  assert.equal(calls[1].params.createonly, '1')
  assert.equal(calls[1].params.baserevid, undefined)
})

test('an edit conflict is an error, never an overwrite', async () => {
  const { fetch } = fakeFetch(() => ({ body: { error: { code: 'editconflict', info: 'Edit conflict.' } } }))
  const api = new WikiApi({ apiUrl: API, fetch })
  api.csrf = 'CT'
  await assert.rejects(api.edit({ title: 'Prune', text: 'T', summary: 'S', baserevid: 140 }), /editconflict/)
})

test('parse posts the text anonymously and returns the HTML', async () => {
  const { fetch, calls } = fakeFetch(() => ({ body: { parse: { text: '<div class="mw-parser-output"></div>' } } }))
  assert.equal(await new WikiApi({ apiUrl: API, fetch }).parse('Prune', '= T ='), '<div class="mw-parser-output"></div>')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].params.contentmodel, 'wikitext')
  assert.equal(calls[0].params.token, undefined)
})
