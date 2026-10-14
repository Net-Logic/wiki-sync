import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeWikiText, escapeHtml, guardLineStart } from '../src/escape.mjs'

test('brackets, braces, pipe and equals are always neutralized', () => {
  assert.equal(escapeWikiText('a [b] {c} |d| e=f'), 'a &#91;b&#93; &#123;c&#125; &#124;d&#124; e&#61;f')
})

test('a single apostrophe inside a word is kept', () => {
  assert.equal(escapeWikiText("l'API"), "l'API")
})

test('an apostrophe at a token edge is neutralized (it could join generated bold markup)', () => {
  assert.equal(escapeWikiText("l'"), 'l&#39;')
  assert.equal(escapeWikiText("'a"), '&#39;a')
})

test('doubled markup characters are neutralized', () => {
  assert.equal(escapeWikiText("a''b"), 'a&#39;&#39;b')
  assert.equal(escapeWikiText('__TOC__'), '&#95;&#95;TOC&#95;&#95;')
  assert.equal(escapeWikiText('x~~~~'), 'x&#126;&#126;&#126;&#126;')
  assert.equal(escapeWikiText('a!!b'), 'a&#33;&#33;b')
})

test('single underscores and tildes inside words are kept', () => {
  assert.equal(escapeWikiText('snake_case a~b'), 'snake_case a~b')
})

test('escapeHtml escapes &, < and >', () => {
  assert.equal(escapeHtml('<?php echo "&";'), '&lt;?php echo "&amp;";')
})

test('guardLineStart neutralizes list, indent, definition, preformat and rule markup', () => {
  assert.equal(guardLineStart('* x'), '&#42; x')
  assert.equal(guardLineStart('# x'), '&#35; x')
  assert.equal(guardLineStart(': x'), '&#58; x')
  assert.equal(guardLineStart('; x'), '&#59; x')
  assert.equal(guardLineStart(' x'), '&#32;x')
  assert.equal(guardLineStart('----'), '&#45;---')
  assert.equal(guardLineStart('-x'), '-x')
  assert.equal(guardLineStart('text'), 'text')
})
