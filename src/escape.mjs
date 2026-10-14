// Wiki markup wherever it appears
const ALWAYS = { '[': '&#91;', ']': '&#93;', '{': '&#123;', '}': '&#125;', '|': '&#124;', '=': '&#61;' }
// Markup only when repeated: '' bold/italic, __MAGIC__ words, ~~~ signatures, !! table header cells
const RUNS = { "'": '&#39;', _: '&#95;', '~': '&#126;', '!': '&#33;' }

// Text that must render literally. The input may already hold HTML entities (marked escapes text tokens).
export function escapeWikiText(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (ALWAYS[c]) {
      out += ALWAYS[c]
    } else if (RUNS[c] && (i === 0 || i === text.length - 1 || text[i - 1] === c || text[i + 1] === c)) {
      // At a token edge the neighbour may be generated markup: l' + '''API''' would read as l''''API'''
      out += RUNS[c]
    } else {
      out += c
    }
  }
  return out
}

export function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// A generated paragraph must not start with list, indent, definition, preformat or rule markup
export function guardLineStart(line) {
  if (/^[*#:; ]/.test(line)) {
    return `&#${line.charCodeAt(0)};${line.slice(1)}`
  }
  if (line.startsWith('----')) {
    return `&#45;${line.slice(1)}`
  }
  return line
}
