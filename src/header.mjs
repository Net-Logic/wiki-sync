import { escapeWikiText } from './escape.mjs'

const DOLISTORE = 'https://www.dolistore.com/product.php'

export function downloadLink(page, product) {
  if (page.download) {
    return { url: page.download, label: 'Télécharger' }
  }
  if (product?.id) {
    return { url: `${DOLISTORE}?id=${encodeURIComponent(product.id)}&l=fr`, label: 'Télécharger sur DoliStore' }
  }
  return null
}

function range(label, value) {
  if (!value?.min || !value?.max) {
    return null
  }
  return `'''${label}''' ${escapeWikiText(String(value.min))} à ${escapeWikiText(String(value.max))}`
}

export function buildHeader({ logoFile, version, product, download }) {
  const lines = [
    `'''Version''' ${escapeWikiText(version)}`,
    range('Dolibarr', product?.dolibarr),
    range('PHP', product?.php),
    download ? `[${download.url.replace(/\]/g, '%5D')} ${download.label}]` : null
  ].filter(line => line !== null)
  const cells = []
  if (logoFile) {
    cells.push(`| [[File:${logoFile}]]`)
  }
  cells.push(`| ${lines.join('<br/>')}`)
  return ['{| class="wikitable"', '|- style="vertical-align:top;"', ...cells, '|}'].join('\n')
}
