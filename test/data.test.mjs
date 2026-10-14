import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from '../src/data.mjs'
import { makeModule, DESCRIPTOR } from './helpers.mjs'

test('loads page, markdown, images, version and DoliStore product', () => {
  const module = loadModule(makeModule(), DESCRIPTOR)
  assert.deepEqual(module.page, { title: 'Prune', logo: 'logo.png', imagePrefix: 'Prune', download: null })
  assert.match(module.markdown, /^# Présentation/)
  assert.deepEqual([...module.images.keys()], ['logo.png', 'screen.png'])
  assert.equal(module.version, '2.0.4')
  assert.deepEqual(module.product, { id: 646, dolibarr: { min: 'V20', max: 'V24' }, php: { min: '7.4', max: '8.5' } })
})

test('product is null without dolistore/product.yml, images empty without wiki/images', () => {
  const dir = makeModule({ 'dolistore/product.yml': null, 'wiki/images/logo.png': null, 'wiki/images/screen.png': null, 'wiki/page.yml': 'title: Prune\n' })
  const module = loadModule(dir, DESCRIPTOR)
  assert.equal(module.product, null)
  assert.equal(module.images.size, 0)
})

test('default image prefix keeps only letters, digits, - and _', () => {
  const page = title => loadModule(makeModule({ 'wiki/page.yml': `title: "${title}"\n` }), DESCRIPTOR).page.imagePrefix
  assert.equal(page("Galerie d'Images"), 'GaleriedImages')
  assert.equal(page('Doli 365'), 'Doli365')
})

test('a title without any usable character needs an explicit image_prefix', () => {
  assert.throws(() => loadModule(makeModule({ 'wiki/page.yml': 'title: "éèà"\n' }), DESCRIPTOR), /image_prefix/)
  const module = loadModule(makeModule({ 'wiki/page.yml': 'title: "éèà"\nimage_prefix: Ete\n' }), DESCRIPTOR)
  assert.equal(module.page.imagePrefix, 'Ete')
})

test('page.yml errors', () => {
  const fails = (yml, pattern) => assert.throws(() => loadModule(makeModule({ 'wiki/page.yml': yml }), DESCRIPTOR), pattern)
  fails('titel: Prune\n', /unknown key "titel"/)
  fails('logo: logo.png\n', /title is required/)
  fails('title: "A|B"\n', /title/)
  fails('title: Prune\nlogo: nope.png\n', /logo "nope.png" not found/)
  fails('title: Prune\ndownload: http://x.y\n', /download must be an https:\/\/ URL/)
  fails('- a\n', /a mapping is expected/)
})

test('missing files', () => {
  assert.throws(() => loadModule(makeModule({ 'wiki/page.yml': null }), DESCRIPTOR), /page\.yml not found/)
  assert.throws(() => loadModule(makeModule({ 'wiki/fr.md': null }), DESCRIPTOR), /fr\.md not found/)
  assert.throws(() => loadModule(makeModule({ 'wiki/fr.md': '  \n' }), DESCRIPTOR), /fr\.md is empty/)
})

test('image file names are checked, dot files ignored', () => {
  const dir = makeModule({ 'wiki/images/.gitkeep': '' })
  assert.deepEqual([...loadModule(dir, DESCRIPTOR).images.keys()], ['logo.png', 'screen.png'])
  assert.throws(() => loadModule(makeModule({ 'wiki/images/mon écran.png': 'x' }), DESCRIPTOR), /image names use letters/)
  assert.throws(() => loadModule(makeModule({ 'wiki/images/doc.pdf': 'x' }), DESCRIPTOR), /image names use letters/)
})
