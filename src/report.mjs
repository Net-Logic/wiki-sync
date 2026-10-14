import { escapeHtml } from './escape.mjs'

// Longest common subsequence on lines; pages are a few hundred lines at most
export function lineDiff(before, after) {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  const lengths = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(`  ${a[i]}`)
      i++
      j++
    } else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1])) {
      out.push(`- ${a[i]}`)
      i++
    } else {
      out.push(`+ ${b[j]}`)
      j++
    }
  }
  return out.join('\n')
}

function verdict(state, force) {
  switch (state) {
    case 'missing':
      return 'the page does not exist: it will be created'
    case 'synced':
      return 'the page is as wiki-sync left it: it will be updated'
    case 'unmarked':
      return force ? 'the page was never synced: --force, it will be overwritten' : 'the page was never synced: a real run REFUSES without force'
    case 'edited':
      return force
        ? 'the page was edited by hand since the last sync: --force, the manual changes will be lost'
        : 'the page was edited by hand since the last sync: a real run REFUSES without force'
    default:
      throw new Error(`Unknown page state ${state}`)
  }
}

const list = names => names.join(', ') || 'none'

export function renderReport({ title, state, force, images, diff }) {
  return [
    `Page: ${title}`,
    `State: ${verdict(state, force)}`,
    `Images to upload: ${list(images.upload)}`,
    `Images unchanged: ${list(images.unchanged)}`,
    `Images in wiki/images not used by the page: ${list(images.unused)}`,
    '',
    diff === null ? 'Page text: no change' : `Page text diff (- wiki, + generated):\n${diff}`
  ].join('\n') + '\n'
}

export function previewHtml(apiUrl, title, body) {
  const origin = new URL(apiUrl).origin
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} (preview)</title>
<base href="${origin}/">
<link rel="stylesheet" href="${origin}/load.php?lang=fr&amp;modules=skins.vector.styles.legacy&amp;only=styles&amp;skin=vector">
</head>
<body class="mediawiki skin-vector">
<div id="content" class="mw-body">
<h1 class="firstHeading">${escapeHtml(title)}</h1>
<div class="mw-body-content">${body}</div>
</div>
</body>
</html>
`
}
