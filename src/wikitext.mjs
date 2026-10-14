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
  const source = markdown.replace(/\r\n?/g, '\n')
  const ctx = { imagePrefix, images, used: new Set() }
  const blocks = []
  let offset = 0
  for (const token of marked.lexer(source)) {
    // Top-level raws follow the source in order: find this one to name its line in errors
    const at = source.indexOf(token.raw, offset)
    const start = at === -1 ? offset : at
    offset = start + token.raw.length
    try {
      const out = renderBlock(token, ctx)
      if (out !== null) {
        blocks.push(out)
      }
    } catch (error) {
      if (error instanceof ConvertError) {
        const line = source.slice(0, start).split('\n').length
        throw new ConvertError(`fr.md line ${line}: ${error.message}`)
      }
      throw error
    }
  }
  return { wikitext: blocks.join('\n\n'), images: ctx.used }
}

function renderBlock(token, ctx) {
  switch (token.type) {
    case 'space':
      return null
    case 'heading': {
      const marks = '='.repeat(token.depth)
      return `${marks} ${renderInline(token.tokens, ctx)} ${marks}`
    }
    case 'paragraph':
      return guardLineStart(renderInline(token.tokens, ctx))
    case 'list':
      return renderList(token, '', ctx)
    case 'table':
      return renderTable(token, ctx)
    case 'blockquote':
      return `<blockquote>\n${renderBlocks(token.tokens, ctx)}\n</blockquote>`
    case 'hr':
      return '----'
    case 'code':
      if (token.lang === 'wikitext') {
        return token.text
      }
      return `<pre>${escapeHtml(token.text)}</pre>`
    case 'html':
      return token.text.replace(/\n+$/, '')
    default:
      throw new ConvertError(`unsupported Markdown block "${token.type}"`)
  }
}

function renderBlocks(tokens, ctx) {
  return tokens.map(token => renderBlock(token, ctx)).filter(out => out !== null).join('\n\n')
}

function renderList(list, parentPrefix, ctx) {
  if (list.ordered && list.start !== 1) {
    throw new ConvertError(`numbered list starting at ${list.start}: wikitext numbering always starts at 1, indent the content between the steps so the list continues`)
  }
  const prefix = parentPrefix + (list.ordered ? '#' : '*')
  const lines = []
  for (const item of list.items) {
    if (item.task) {
      throw new ConvertError('task list items ("- [ ]") are not supported')
    }
    const parts = []
    const nested = []
    for (const child of item.tokens) {
      if (child.type === 'space') {
        continue
      }
      if (child.type === 'list') {
        nested.push(renderList(child, prefix, ctx))
      } else if (child.type === 'text' || child.type === 'paragraph') {
        if (nested.length) {
          throw new ConvertError('text after a nested list in the same item is not supported')
        }
        parts.push(renderInline(child.tokens, ctx))
      } else {
        throw new ConvertError(`"${child.type}" inside a list item is not supported`)
      }
    }
    // Several paragraphs of one item (a step and its screenshot) stay on the item line
    lines.push(`${prefix} ${parts.join('<br/>')}`, ...nested)
  }
  return lines.join('\n')
}

function renderTable(table, ctx) {
  const cell = (marker, content, align) => {
    const text = renderInline(content.tokens, ctx)
    return align ? `${marker} style="text-align:${align};" | ${text}` : `${marker} ${text}`
  }
  const lines = ['{| class="wikitable"']
  lines.push(...table.header.map((content, i) => cell('!', content, table.align[i])))
  for (const row of table.rows) {
    lines.push('|-', ...row.map((content, i) => cell('|', content, table.align[i])))
  }
  lines.push('|}')
  return lines.join('\n')
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
