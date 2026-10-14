import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadModule } from './data.mjs'
import { toWikitext } from './wikitext.mjs'
import { buildHeader, downloadLink } from './header.mjs'
import { assemblePage, generatedComment, pageState } from './page.mjs'
import { lineDiff, renderReport, previewHtml } from './report.mjs'

const sha1 = data => createHash('sha1').update(data).digest('hex')

function firstDifferentLine(a, b) {
  const left = a.split('\n')
  const right = b.split('\n')
  let i = 0
  while (i < left.length && i < right.length && left[i] === right[i]) {
    i++
  }
  return i + 1
}

export async function run({ modulePath, descriptor, out, api, apiUrl, repository, submit = false, force = false, sourceUrl = null, credentials = null, log = console.log }) {
  // Everything local first: a bad fr.md fails before any network call
  const module = loadModule(modulePath, descriptor)
  const { page } = module
  const wikiName = name => `${page.imagePrefix}-${name}`
  const converted = toWikitext(module.markdown, { imagePrefix: page.imagePrefix, images: new Set(module.images.keys()) })
  const used = new Set(converted.images)
  if (page.logo) {
    used.add(page.logo)
  }
  const header = buildHeader({
    logoFile: page.logo ? wikiName(page.logo) : null,
    version: module.version,
    product: module.product,
    download: downloadLink(page, module.product)
  })
  const text = assemblePage({ comment: generatedComment(sourceUrl), header, body: converted.wikitext })

  const current = await api.readPage(page.title)
  const state = pageState(current)
  const names = [...used].sort()
  const remote = await api.fileSha1s(names.map(wikiName))
  const upload = names.filter(name => remote.get(wikiName(name)) !== sha1(readFileSync(module.images.get(name))))
  const images = {
    upload,
    unchanged: names.filter(name => !upload.includes(name)),
    unused: [...module.images.keys()].filter(name => !used.has(name))
  }
  const noChange = current.exists && current.content === text

  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'page.wiki'), text + '\n')
  writeFileSync(join(out, 'diff.txt'), renderReport({ title: page.title, state, force, images, diff: noChange ? null : lineDiff(current.exists ? current.content : '', text) }))
  writeFileSync(join(out, 'preview.html'), previewHtml(apiUrl, page.title, await api.parse(page.title, text)))
  log(`Page "${page.title}": ${state}, ${upload.length} image(s) to upload, text ${noChange ? 'unchanged' : 'changed'}. Report in ${out}`)

  if (!submit) {
    return { status: 'dry-run', state, images }
  }
  if (state === 'unmarked' && !force) {
    throw new Error(`Refused: the page "${page.title}" was never synced by wiki-sync. Check ${join(out, 'diff.txt')}, then run once with --force to take it over`)
  }
  if (state === 'edited' && !force) {
    throw new Error(`Refused: the page "${page.title}" was edited by hand since the last sync. Move those changes into wiki/fr.md, then run with --force`)
  }

  await api.login(credentials.login, credentials.password)
  const summary = `wiki-sync: ${repository} v${module.version}`
  // Images before the page, so the page never shows missing files
  for (const name of upload) {
    await api.upload(wikiName(name), readFileSync(module.images.get(name)), summary)
    log(`Uploaded File:${wikiName(name)}`)
  }
  if (noChange) {
    log('Page text: no change')
    return { status: 'no-change', state, images }
  }
  await api.edit({ title: page.title, text, summary, baserevid: current.exists ? current.revid : null })
  const saved = await api.readPage(page.title)
  if (saved.content !== text) {
    throw new Error(`The wiki saved a different text (first difference at line ${firstDifferentLine(saved.content, text)}): the next run would see a page edited by hand. Compare the page with ${join(out, 'page.wiki')} and avoid that construct`)
  }
  log(`Page "${page.title}" saved`)
  return { status: 'updated', state, images }
}
