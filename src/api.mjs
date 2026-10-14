const USER_AGENT = 'wiki-sync (https://github.com/Net-Logic/wiki-sync)'
const TITLES_PER_QUERY = 50

export class WikiApi {
  constructor({ apiUrl, fetch = globalThis.fetch }) {
    this.apiUrl = apiUrl
    this.fetch = fetch
    this.cookies = new Map()
    this.csrf = null
  }

  async request(params, { post = false, files = {} } = {}) {
    const all = { ...params, format: 'json', formatversion: '2' }
    const init = { headers: { 'User-Agent': USER_AGENT } }
    let url = this.apiUrl
    if (post) {
      const form = new FormData()
      for (const [key, value] of Object.entries(all)) {
        form.append(key, String(value))
      }
      for (const [key, file] of Object.entries(files)) {
        form.append(key, new Blob([file.data]), file.name)
      }
      init.method = 'POST'
      init.body = form
    } else {
      url += '?' + new URLSearchParams(all)
    }
    if (this.cookies.size) {
      init.headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    }
    const response = await this.fetch(url, init)
    // The login token is bound to the session cookie of the request that fetched it
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';')
      const at = pair.indexOf('=')
      this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
    }
    if (!response.ok) {
      throw new Error(`Wiki API HTTP ${response.status} on ${params.action}`)
    }
    const data = await response.json()
    if (data.error) {
      throw new Error(`Wiki API ${params.action}: ${data.error.code}: ${data.error.info}`)
    }
    return data
  }

  async login(name, password) {
    const tokens = await this.request({ action: 'query', meta: 'tokens', type: 'login' })
    const data = await this.request({ action: 'login', lgname: name, lgpassword: password, lgtoken: tokens.query.tokens.logintoken }, { post: true })
    if (data.login.result !== 'Success') {
      throw new Error(`Wiki login refused: ${data.login.result}${data.login.reason ? ` (${data.login.reason})` : ''}`)
    }
    const csrf = await this.request({ action: 'query', meta: 'tokens', type: 'csrf' })
    this.csrf = csrf.query.tokens.csrftoken
  }

  async readPage(title) {
    const data = await this.request({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', titles: title })
    const page = data.query.pages[0]
    if (page.invalid) {
      throw new Error(`Invalid wiki page title "${title}": ${page.invalidreason}`)
    }
    if (page.missing) {
      return { exists: false, title: page.title }
    }
    const revision = page.revisions[0]
    return { exists: true, title: page.title, revid: revision.revid, content: revision.slots.main.content }
  }

  // sha1 (hex) of the current version of each file, null when the file does not exist
  async fileSha1s(names) {
    const result = new Map()
    for (let i = 0; i < names.length; i += TITLES_PER_QUERY) {
      const chunk = names.slice(i, i + TITLES_PER_QUERY)
      const data = await this.request({ action: 'query', prop: 'imageinfo', iiprop: 'sha1', titles: chunk.map(name => `File:${name}`).join('|') })
      // The wiki answers with its own titles (Fichier:, spaces, first letter upper case)
      const normalized = new Map((data.query.normalized ?? []).map(entry => [entry.from, entry.to]))
      const pages = new Map((data.query.pages ?? []).map(page => [page.title, page]))
      for (const name of chunk) {
        const asked = `File:${name}`
        const page = pages.get(normalized.get(asked) ?? asked)
        result.set(name, page && !page.missing && page.imageinfo ? page.imageinfo[0].sha1 : null)
      }
    }
    return result
  }

  async upload(name, data, comment) {
    const response = await this.request(
      { action: 'upload', filename: name, comment, ignorewarnings: '1', token: this.csrf },
      { post: true, files: { file: { name, data } } }
    )
    if (response.upload?.result !== 'Success') {
      throw new Error(`Upload of ${name} failed: ${JSON.stringify(response.upload)}`)
    }
  }

  async edit({ title, text, summary, baserevid }) {
    const params = { action: 'edit', title, text, summary, bot: '1', token: this.csrf }
    if (baserevid) {
      // An edit made since baserevid gives editconflict or is merged, never silently overwritten
      params.baserevid = baserevid
      params.nocreate = '1'
    } else {
      params.createonly = '1'
    }
    const response = await this.request(params, { post: true })
    if (response.edit?.result !== 'Success') {
      throw new Error(`Edit of ${title} failed: ${JSON.stringify(response.edit)}`)
    }
    return response.edit
  }

  // The text as the wiki would store it (pre-save transform: signatures, pipe trick...), without saving
  async preSaveTransform(title, text) {
    const data = await this.request({ action: 'parse', title, text, contentmodel: 'wikitext', onlypst: '1' }, { post: true })
    return data.parse.text
  }

  async parse(title, text) {
    const data = await this.request({ action: 'parse', title, text, contentmodel: 'wikitext', prop: 'text', disablelimitreport: '1' }, { post: true })
    return data.parse.text
  }
}
