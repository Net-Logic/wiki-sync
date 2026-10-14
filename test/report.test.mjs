import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineDiff, renderReport, previewHtml } from '../src/report.mjs'

test('lineDiff marks kept, removed and added lines', () => {
  assert.equal(lineDiff('a\nb\nc', 'a\nB\nc\nd'), '  a\n- b\n+ B\n  c\n+ d')
})

test('lineDiff from an empty page adds every line', () => {
  assert.equal(lineDiff('', 'a\nb'), '+ a\n+ b')
})

const images = { upload: ['screen.png'], unchanged: ['logo.png'], unused: [] }

test('report of a page never synced, without and with force', () => {
  const refused = renderReport({ title: 'Prune', state: 'unmarked', force: false, images, diff: '+ a' })
  assert.match(refused, /^Page: Prune$/m)
  assert.match(refused, /never synced: a real run REFUSES without force/)
  assert.match(refused, /^Images to upload: screen\.png$/m)
  assert.match(refused, /^Images unchanged: logo\.png$/m)
  assert.match(refused, /^Images in wiki\/images not used by the page: none$/m)
  assert.match(refused, /Page text diff \(- wiki, \+ generated\):\n\+ a/)
  assert.match(renderReport({ title: 'Prune', state: 'unmarked', force: true, images, diff: '+ a' }), /--force, it will be overwritten/)
})

test('report of other states', () => {
  assert.match(renderReport({ title: 'P', state: 'missing', force: false, images, diff: '+ a' }), /will be created/)
  assert.match(renderReport({ title: 'P', state: 'synced', force: false, images, diff: null }), /Page text: no change/)
  assert.match(renderReport({ title: 'P', state: 'edited', force: false, images, diff: '- x' }), /edited by hand since the last sync: a real run REFUSES/)
})

test('preview uses the wiki stylesheet and resolves image URLs on the wiki', () => {
  const html = previewHtml('https://wiki.netlogic.fr/api.php', 'Galerie <d>', '<p>x</p>')
  assert.match(html, /<base href="https:\/\/wiki\.netlogic\.fr\/">/)
  assert.match(html, /load\.php\?lang=fr&amp;modules=skins\.vector\.styles\.legacy/)
  assert.match(html, /<h1 class="firstHeading">Galerie &lt;d&gt;<\/h1>/)
  assert.match(html, /<p>x<\/p>/)
})
