import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pageState } from './page.mjs'
import { lineDiff, renderReport, previewHtml } from './report.mjs'

const sha1 = data => createHash('sha1').update(data).digest('hex')

function firstDifferentLine(a, b) {
  const left = a.split('\n')
  const right = b.split('\n')
  let i = 0
  while (i < left.length && i < right.length && left[i] === right[i]) {
    i++
  }
  return { line: i + 1, generated: right[i] ?? '', stored: left[i] ?? '' }
}

// Report, then (with submit) upload and save one generated page.
// images: [{ name, wikiName, path }] local files the page uses; unused: local names it does not use;
// problems: reasons found by the caller for which a real run must refuse.
export async function publish({ api, apiUrl, title, text, images = [], unused = [], problems = [], out, summary, submit = false, force = false, credentials = null, log = console.log }) {
  const current = await api.readPage(title)
  const state = pageState(current)
  const remote = await api.fileSha1s(images.map(image => image.wikiName))
  const toUpload = images.filter(image => remote.get(image.wikiName) !== sha1(readFileSync(image.path)))
  const report = {
    upload: toUpload.map(image => image.name),
    unchanged: images.filter(image => !toUpload.includes(image)).map(image => image.name),
    unused
  }
  const noChange = current.exists && current.content === text
  // A text the wiki rewrites on save would carry a wrong marker: every later run would see a hand-edited page
  const stored = await api.preSaveTransform(title, text)
  const presave = stored === text ? null : firstDifferentLine(stored, text)

  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'page.wiki'), text + '\n')
  writeFileSync(join(out, 'diff.txt'), renderReport({ title, state, force, images: report, presave, problems, diff: noChange ? null : lineDiff(current.exists ? current.content : '', text) }))
  writeFileSync(join(out, 'preview.html'), previewHtml(apiUrl, title, await api.parse(title, text)))
  log(`Page "${title}": ${state}, ${toUpload.length} image(s) to upload, text ${noChange ? 'unchanged' : 'changed'}. Report in ${out}`)
  if (presave) {
    log(`Warning: the wiki would rewrite line ${presave.line} on save, see ${join(out, 'diff.txt')}`)
  }
  for (const problem of problems) {
    log(`Problem: ${problem}`)
  }

  if (!submit) {
    return { status: 'dry-run', state, images: report }
  }
  if (problems.length) {
    throw new Error(`Refused: ${problems.join('; ')}`)
  }
  if (presave) {
    throw new Error(`Refused: the wiki would rewrite line ${presave.line} of the generated text on save ("${presave.generated}" stored as "${presave.stored}"). Change that construct in the source`)
  }
  if (state === 'unmarked' && !force) {
    throw new Error(`Refused: the page "${title}" was never synced by wiki-sync. Check ${join(out, 'diff.txt')}, then run once with --force to take it over`)
  }
  if (state === 'edited' && !force) {
    throw new Error(`Refused: the page "${title}" was edited by hand since the last sync. Move those changes into the source, then run with --force`)
  }

  await api.login(credentials.login, credentials.password)
  // Images before the page, so the page never shows missing files
  for (const image of toUpload) {
    await api.upload(image.wikiName, readFileSync(image.path), summary)
    log(`Uploaded File:${image.wikiName}`)
  }
  if (noChange) {
    log('Page text: no change')
    return { status: 'no-change', state, images: report }
  }
  let editError = null
  try {
    await api.edit({ title, text, summary, baserevid: current.exists ? current.revid : null })
  } catch (error) {
    // A retry after a lost answer conflicts with our own saved edit: the page then holds the generated text
    editError = error
  }
  const saved = await api.readPage(title)
  if (editError && saved.content !== text) {
    throw editError
  }
  if (saved.content !== text) {
    const { line } = firstDifferentLine(saved.content, text)
    throw new Error(`The wiki saved a different text (first difference at line ${line}): a concurrent edit was merged, or the wiki rewrote a construct. Compare the page with ${join(out, 'page.wiki')}; the next run needs --force`)
  }
  log(`Page "${title}" saved`)
  return { status: 'updated', state, images: report }
}
