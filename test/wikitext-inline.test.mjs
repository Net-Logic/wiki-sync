import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toWikitext, ConvertError } from '../src/wikitext.mjs'

const options = { imagePrefix: 'Prune', images: new Set(['screen.png', 'logo.png']) }
const convert = markdown => toWikitext(markdown, options).wikitext

test('bold and italic', () => {
  assert.equal(convert('Le **module** *Prune*'), "Le '''module''' ''Prune''")
})

test('an apostrophe before bold does not merge with the bold markup', () => {
  assert.equal(convert("l'**API**"), "l&#39;'''API'''")
})

test('inline code is literal: nowiki, as the spec says', () => {
  assert.equal(convert('`a = b` `<x>`'), '<code><nowiki>a = b</nowiki></code> <code><nowiki>&lt;x&gt;</nowiki></code>')
  assert.equal(convert('`https://wiki.netlogic.fr/api.php`'), '<code><nowiki>https://wiki.netlogic.fr/api.php</nowiki></code>')
})

test('inline code cannot close its nowiki', () => {
  assert.equal(convert('`</nowiki>[[x]]`'), '<code><nowiki>&lt;/nowiki&gt;[[x]]</nowiki></code>')
})

test('text keeps the HTML escaping of marked', () => {
  assert.equal(convert('a & b < c'), 'a &amp; b &lt; c')
})

test('wiki markup in text renders literally', () => {
  assert.equal(convert('[[x]] {{y}}'), '&#91;&#91;x&#93;&#93; &#123;&#123;y&#125;&#125;')
})

test('a soft line break becomes a space, a hard one <br/>', () => {
  assert.equal(convert('one\ntwo'), 'one two')
  assert.equal(convert('line one  \nline two'), 'line one<br/>line two')
})

test('strikethrough and inline HTML', () => {
  assert.equal(convert('~~old~~ <span style="color:red">b</span>'), '<del>old</del> <span style="color:red">b</span>')
})

test('external links', () => {
  assert.equal(convert('[site](https://netlogic.fr)'), '[https://netlogic.fr site]')
  assert.equal(convert('https://netlogic.fr'), 'https://netlogic.fr')
  assert.equal(convert('[mail](mailto:dolibarr@netlogic.fr)'), '[mailto:dolibarr@netlogic.fr mail]')
})

test('wiki links', () => {
  assert.equal(convert('[Corbeille](wiki:Corbeille)'), '[[Corbeille]]')
  assert.equal(convert('[la corbeille](wiki:Corbeille)'), '[[Corbeille|la corbeille]]')
  assert.equal(convert('[relance](wiki:Relance%20Facture%20Globale)'), '[[Relance Facture Globale|relance]]')
  assert.equal(convert("[galerie](<wiki:Galerie d'Images>)"), "[[Galerie d'Images|galerie]]")
})

test('a relative link is refused', () => {
  assert.throws(() => convert('[doc](../doc.md)'), /only http\(s\), mailto and wiki:<Page> links/)
})

test('a wiki link without text is refused (the wiki would rewrite [[Page|]] on save)', () => {
  assert.throws(() => convert('[](wiki:Corbeille)'), /empty link text/)
})

test('a wiki link with markup characters is refused', () => {
  assert.throws(() => convert('[x](<wiki:A|B>)'), /invalid wiki page name/)
})

test('images become prefixed files with size and alt text', () => {
  const result = toWikitext('![Écran](images/screen.png "800px") ![](images/logo.png)', options)
  assert.equal(result.wikitext, '[[File:Prune-screen.png|800px|Écran]] [[File:Prune-logo.png]]')
  assert.deepEqual([...result.images].sort(), ['logo.png', 'screen.png'])
})

test('image errors', () => {
  assert.throws(() => convert('![a](screen.png)'), ConvertError)
  assert.throws(() => convert('![a](screen.png)'), /images\/<file>/)
  assert.throws(() => convert('![a](images/missing.png)'), /not found in wiki\/images/)
  assert.throws(() => convert('![a](images/screen.png "big")'), /must be a size such as 800px/)
})

test('a paragraph starting with markup is guarded', () => {
  assert.equal(convert('\\* not a list'), '&#42; not a list')
})
