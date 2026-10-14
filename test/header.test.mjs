import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeader, downloadLink } from '../src/header.mjs'

const product = { id: 646, dolibarr: { min: 'V20', max: 'V24' }, php: { min: '7.4', max: 8.5 } }

test('download link: page.yml first, then DoliStore, else none', () => {
  assert.deepEqual(downloadLink({ download: 'https://x.y/a.zip' }, product), { url: 'https://x.y/a.zip', label: 'Télécharger' })
  assert.deepEqual(downloadLink({ download: null }, product), { url: 'https://www.dolistore.com/product.php?id=646&l=fr', label: 'Télécharger sur DoliStore' })
  assert.equal(downloadLink({ download: null }, null), null)
})

test('full header', () => {
  const header = buildHeader({ logoFile: 'Prune-logo.png', version: '2.0.4', product, download: downloadLink({ download: null }, product) })
  assert.equal(header, [
    '{| class="wikitable"',
    '|- style="vertical-align:top;"',
    '| [[File:Prune-logo.png]]',
    "| '''Version''' 2.0.4<br/>'''Dolibarr''' V20 à V24<br/>'''PHP''' 7.4 à 8.5<br/>[https://www.dolistore.com/product.php?id=646&l=fr Télécharger sur DoliStore]",
    '|}'
  ].join('\n'))
})

test('minimal header: no logo, no product, no download', () => {
  assert.equal(
    buildHeader({ logoFile: null, version: '1.0', product: null, download: null }),
    "{| class=\"wikitable\"\n|- style=\"vertical-align:top;\"\n| '''Version''' 1.0\n|}"
  )
})
