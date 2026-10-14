import { loadModule } from './data.mjs'
import { toWikitext } from './wikitext.mjs'
import { buildHeader, downloadLink } from './header.mjs'
import { assemblePage, generatedComment } from './page.mjs'
import { publish } from './publish.mjs'

// The page of one module, from its wiki/ folder
export async function run({ modulePath, descriptor, out, api, apiUrl, repository, submit = false, force = false, sourceUrl = null, credentials = null, log = console.log }) {
  // Everything local first: a bad fr.md fails before any network call
  const module = loadModule(modulePath, descriptor)
  const { page } = module
  const wikiName = name => `${page.imagePrefix}-${name}`
  const converted = toWikitext(module.markdown, { imagePrefix: page.imagePrefix, images: new Set(module.images.keys()) })
  const used = new Set(converted.images)
  if (page.logo) {
    used.add(page.logo)
  }
  const header = buildHeader({
    logoFile: page.logo ? wikiName(page.logo) : null,
    version: module.version,
    product: module.product,
    download: downloadLink(page, module.product)
  })
  const text = assemblePage({ comment: generatedComment(sourceUrl), header, body: converted.wikitext })
  const images = [...used].sort().map(name => ({ name, wikiName: wikiName(name), path: module.images.get(name) }))
  const unused = [...module.images.keys()].filter(name => !used.has(name))
  return publish({
    api, apiUrl, title: page.title, text, images, unused, out, submit, force, credentials, log,
    summary: `wiki-sync: ${repository} v${module.version}`
  })
}
