import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toWikitext } from '../src/wikitext.mjs'

const options = { imagePrefix: 'Prune', images: new Set(['screen.png']) }
const convert = markdown => toWikitext(markdown, options).wikitext

test('headings, blocks separated by a blank line', () => {
  assert.equal(convert('# Présentation\n\ntext\n\n## Installation'), '= Présentation =\n\ntext\n\n== Installation ==')
})

test('an equals sign in a heading cannot close it', () => {
  assert.equal(convert('# a = b'), '= a &#61; b =')
})

test('nested bullet list', () => {
  assert.equal(convert('- a\n  - b\n- c'), '* a\n** b\n* c')
})

test('numbered list with a nested bullet list', () => {
  assert.equal(convert('1. one\n2. two\n   - sub'), '# one\n# two\n#* sub')
})

test('a screenshot indented under a step stays in the step, numbering continues', () => {
  assert.equal(
    convert('1. Download\n\n   ![s](images/screen.png)\n\n2. Deploy'),
    '# Download<br/>[[File:Prune-screen.png|s]]\n# Deploy'
  )
})

test('list errors', () => {
  assert.throws(() => convert('3. three'), /starting at 3/)
  assert.throws(() => convert('- [ ] todo'), /task list/)
  assert.throws(() => convert('- a\n\n  ```\n  x\n  ```'), /"code" inside a list item/)
})

test('table with alignment', () => {
  assert.equal(
    convert('| A | B |\n|:--|--:|\n| 1 | 2 |'),
    '{| class="wikitable"\n! style="text-align:left;" | A\n! style="text-align:right;" | B\n|-\n| style="text-align:left;" | 1\n| style="text-align:right;" | 2\n|}'
  )
})

test('table without alignment', () => {
  assert.equal(convert('| A |\n|---|\n| x |'), '{| class="wikitable"\n! A\n|-\n| x\n|}')
})

test('quote, rule, HTML block', () => {
  assert.equal(convert('> q'), '<blockquote>\nq\n</blockquote>')
  assert.equal(convert('---'), '----')
  assert.equal(convert('<div class="x">y</div>'), '<div class="x">y</div>')
})

test('code block becomes an escaped pre, a wikitext block passes as is', () => {
  assert.equal(convert('```php\n<?php echo "&";\n```'), '<pre>&lt;?php echo "&amp;";</pre>')
  assert.equal(convert('```wikitext\n{{Note|x}}\n```'), '{{Note|x}}')
})

test('an error names the line of its block', () => {
  assert.throws(() => convert('intro\n\nmore\n\n- [ ] todo'), /^ConvertError: fr\.md line 5: task list/)
})

test('Windows line endings convert like Unix ones, line numbers included', () => {
  assert.equal(convert('# T\r\n\r\n- a\r\n- b\r\n'), '= T =\n\n* a\n* b')
  assert.throws(() => convert('intro\r\n\r\n- [ ] todo'), /fr\.md line 3:/)
})

test('a UTF-8 BOM at the start of fr.md is ignored', () => {
  assert.equal(convert('\uFEFF# Présentation\n\nTexte'), '= Présentation =\n\nTexte')
})
