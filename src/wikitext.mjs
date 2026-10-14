import { marked } from 'marked'
import { escapeWikiText, escapeHtml, guardLineStart } from './escape.mjs'

const SIZE = /^(\d+px|x\d+px|\d+x\d+px)$/
const IMAGE = /^images\/([A-Za-z0-9._-]+)$/
const EXTERNAL = /^(https?:|mailto:)/i
const BAD_PAGE_NAME = /[[\]{}|<>]/

export class ConvertError extends Error {
  constructor(message) {
    super(message)
    // assert.throws(fn, /^ConvertError: .../) and the CLI message rely on this name
    this.name = 'ConvertError'
  }
}

// Convert wiki/fr.md to wikitext. Returns the text and the set of wiki/images files it uses.
export function toWikitext(markdown, { imagePrefix, images }) {
  const ctx = { imagePrefix, images, used: new Set() }
  const blocks = []
  for (const token of marked.lexer(markdown)) {
    const out = renderBlock(token, ctx)
    if (out !== null) {
      blocks.push(out)
    }
  }
  return { wikitext: blocks.join('\n\n'), images: ctx.used }
}

function renderBlock(token, ctx) {
  switch (token.type) {
    case 'space':
      return null
    case 'paragraph':
      return guardLineStart(renderInline(token.tokens, ctx))
    default:
      throw new ConvertError(`unsupported Markdown block "${token.type}"`)
  }
}

function renderInline(tokens, ctx) {
  return tokens.map(token => renderInlineToken(token, ctx)).join('')
}

function renderInlineToken(token, ctx) {
  switch (token.type) {
    case 'text':
      // List items wrap their inline tokens in one text token
      if (token.tokens) {
        return renderInline(token.tokens, ctx)
      }
      return escapeWikiText(token.text.replace(/\n/g, ' '))
    case 'escape':
      return escapeWikiText(token.text)
    case 'strong':
      return `'''${renderInline(token.tokens, ctx)}'''`
    case 'em':
      return `''${renderInline(token.tokens, ctx)}''`
    case 'del':
      return `<del>${renderInline(token.tokens, ctx)}</del>`
    case 'codespan':
      return `<code>${escapeWikiText(token.text.replace(/\n/g, ' '))}</code>`
    case 'br':
      return '<br/>'
    case 'html':
      return token.text
    case 'link':
      return renderLink(token, ctx)
    case 'image':
      return renderImage(token, ctx)
    default:
      throw new ConvertError(`unsupported Markdown inline element "${token.type}"`)
  }
}

function renderLink(token, ctx) {
  if (token.href.startsWith('wiki:')) {
    const page = decodeURIComponent(token.href.slice(5)).trim()
    if (!page || BAD_PAGE_NAME.test(page)) {
      throw new ConvertError(`link "${token.href}": invalid wiki page name`)
    }
    return token.text === page ? `[[${page}]]` : `[[${page}|${renderInline(token.tokens, ctx)}]]`
  }
  if (!EXTERNAL.test(token.href)) {
    throw new ConvertError(`link "${token.href}": only http(s), mailto and wiki:<Page> links are supported`)
  }
  const url = token.href.replace(/ /g, '%20').replace(/\[/g, '%5B').replace(/\]/g, '%5D')
  if (token.text === token.href) {
    return url
  }
  return `[${url} ${renderInline(token.tokens, ctx)}]`
}

function renderImage(token, ctx) {
  const match = IMAGE.exec(token.href)
  if (!match) {
    throw new ConvertError(`image "${token.href}": images must be files of wiki/images, written images/<file>`)
  }
  const name = match[1]
  if (!ctx.images.has(name)) {
    throw new ConvertError(`image "${token.href}" not found in wiki/images`)
  }
  const params = [`File:${ctx.imagePrefix}-${name}`]
  if (token.title) {
    if (!SIZE.test(token.title)) {
      throw new ConvertError(`image "${token.href}": the title "${token.title}" must be a size such as 800px, x300px or 640x480px`)
    }
    params.push(token.title)
  }
  if (token.text) {
    params.push(escapeWikiText(token.text))
  }
  ctx.used.add(name)
  return `[[${params.join('|')}]]`
}
