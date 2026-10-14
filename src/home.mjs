import { readFileSync } from 'node:fs'
import YAML from 'yaml'
import { escapeWikiText } from './escape.mjs'
import { toWikitext } from './wikitext.mjs'
import { assemblePage, generatedComment } from './page.mjs'
import { publish } from './publish.mjs'

const HOME_KEYS = ['title', 'headline', 'intro', 'groups', 'contact']
const GROUP_KEYS = ['heading', 'modules']
const MODULE_KEYS = ['page', 'logo', 'description', 'dolistore', 'name']
const BAD_TITLE = /[[\]{}|#<>]/
const LOGO = /^[^[\]{}|#<>/:]+\.(png|jpe?g|gif|svg)$/i
const EMAIL = /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/

const HERO = '<div style="padding:18px 22px; margin-bottom:20px; border-radius:8px; background:linear-gradient(90deg,#f3f6fb,#ffffff); border:1px solid #dbe3ef;">'
const GRID = '<div style="display:flex; flex-wrap:wrap; gap:16px; margin:12px 0 24px;">'
// Fixed width: a short last row keeps the size of the other cards
const CARD = '<div style="flex:0 1 280px; box-sizing:border-box; border:1px solid #c8ccd1; border-radius:8px; padding:14px 16px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.08);">'

function checkKeys(data, allowed, where) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`${where}: a mapping is expected`)
  }
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      throw new Error(`${where}: unknown key "${key}" (allowed: ${allowed.join(', ')})`)
    }
  }
}

function text(data, key, where) {
  if (typeof data[key] !== 'string' || !data[key].trim()) {
    throw new Error(`${where}: ${key} is required`)
  }
  return data[key].trim()
}

function readModule(data, where) {
  checkKeys(data, MODULE_KEYS, where)
  const page = text(data, 'page', where)
  if (BAD_TITLE.test(page)) {
    throw new Error(`${where}: invalid page title "${page}"`)
  }
  const logo = text(data, 'logo', where)
  if (!LOGO.test(logo)) {
    throw new Error(`${where}: logo must be an image file name already on the wiki (without File:)`)
  }
  if (data.dolistore !== undefined && !(Number.isInteger(data.dolistore) && data.dolistore > 0)) {
    throw new Error(`${where}: dolistore must be a DoliStore product id`)
  }
  return {
    page,
    logo,
    description: text(data, 'description', where),
    dolistore: data.dolistore ?? null,
    name: data.name === undefined ? page : text(data, 'name', where)
  }
}

// The home page list (home/accueil.yml): every module card, by group
export function loadHome(path) {
  const data = YAML.parse(readFileSync(path, 'utf8')) ?? {}
  checkKeys(data, HOME_KEYS, path)
  const title = text(data, 'title', path)
  if (BAD_TITLE.test(title)) {
    throw new Error(`${path}: invalid page title "${title}"`)
  }
  if (!Array.isArray(data.groups) || !data.groups.length) {
    throw new Error(`${path}: at least one group is required`)
  }
  const seen = new Set()
  const groups = data.groups.map((group, g) => {
    const where = `${path}: groups[${g}]`
    checkKeys(group, GROUP_KEYS, where)
    if (!Array.isArray(group.modules) || !group.modules.length) {
      throw new Error(`${where}: at least one module is required`)
    }
    const modules = group.modules.map((module, m) => readModule(module, `${where}.modules[${m}]`))
    for (const module of modules) {
      if (seen.has(module.page)) {
        throw new Error(`${path}: page "${module.page}" is listed twice`)
      }
      seen.add(module.page)
    }
    return { heading: text(group, 'heading', where), modules }
  })
  const contact = data.contact === undefined ? null : String(data.contact)
  if (contact !== null && !EMAIL.test(contact)) {
    throw new Error(`${path}: contact must be an e-mail address`)
  }
  return { title, headline: text(data, 'headline', path), intro: text(data, 'intro', path), groups, contact }
}

// One paragraph of Markdown (bold, links...) as inline wikitext
function inline(markdown, where) {
  const { wikitext } = toWikitext(markdown, { imagePrefix: 'home', images: new Set() })
  if (wikitext.includes('\n')) {
    throw new Error(`${where} must be a single paragraph`)
  }
  return wikitext
}

function renderCard(module) {
  const links = [`[[${module.page}|Documentation]]`]
  if (module.dolistore) {
    links.push(`[https://www.dolistore.com/product.php?id=${module.dolistore}&l=fr DoliStore]`)
  }
  return [
    CARD,
    `<div style="display:flex; gap:14px; align-items:center;">[[File:${module.logo}|64px|link=${module.page}]]<div style="font-size:115%;">'''[[${module.page}|${escapeWikiText(module.name)}]]'''</div></div>`,
    `<div style="margin:10px 0 8px;">${inline(module.description, `${module.page}: description`)}</div>`,
    `<div style="font-size:90%;">${links.join(' · ')}</div>`,
    '</div>'
  ].join('\n')
}

export function renderHome(home) {
  const lines = [
    HERO,
    `<div style="font-size:150%; font-weight:bold;">${escapeWikiText(home.headline)}</div>`,
    `<div style="margin-top:6px;">${inline(home.intro, 'intro')}</div>`,
    '</div>',
    '__NOTOC__'
  ]
  for (const group of home.groups) {
    lines.push(`== ${escapeWikiText(group.heading)} ==`, GRID, ...group.modules.map(renderCard), '</div>')
  }
  if (home.contact) {
    lines.push("== Besoin d'aide ? ==", `Écrivez à [mailto:${home.contact} ${home.contact}].`)
  }
  return lines.join('\n')
}

// The home page of the wiki, from home/accueil.yml
export async function runHome({ homePath, out, api, apiUrl, repository, submit = false, force = false, sourceUrl = null, credentials = null, log = console.log }) {
  // Everything local first: a bad list fails before any network call
  const home = loadHome(homePath)
  const text = assemblePage({ comment: generatedComment(sourceUrl), header: '', body: renderHome(home) })
  const modules = home.groups.flatMap(group => group.modules)
  const pages = await api.pagesExist(modules.map(module => module.page))
  const logos = await api.fileSha1s(modules.map(module => module.logo))
  const problems = [
    ...modules.filter(module => !pages.get(module.page)).map(module => `wiki page "${module.page}" does not exist`),
    ...modules.filter(module => !logos.get(module.logo)).map(module => `logo "File:${module.logo}" of "${module.page}" does not exist on the wiki`)
  ]
  return publish({
    api, apiUrl, title: home.title, text, problems, out, submit, force, credentials, log,
    summary: `wiki-sync: ${repository} home page`
  })
}
