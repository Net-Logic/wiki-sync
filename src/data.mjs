import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import YAML from 'yaml'
import { readModuleVersion } from './version.mjs'

const PAGE_KEYS = ['title', 'logo', 'image_prefix', 'download']
const IMAGE_NAME = /^[A-Za-z0-9._-]+\.(png|jpe?g|gif)$/i
const BAD_TITLE = /[[\]{}|#<>]/

export function loadModule(modulePath, descriptorPath) {
  const wikiDir = resolve(modulePath, 'wiki')
  const page = readPage(join(wikiDir, 'page.yml'))
  const markdownPath = join(wikiDir, 'fr.md')
  if (!existsSync(markdownPath)) {
    throw new Error(`${markdownPath} not found`)
  }
  const markdown = readFileSync(markdownPath, 'utf8')
  if (!markdown.trim()) {
    throw new Error(`${markdownPath} is empty`)
  }
  const images = readImages(join(wikiDir, 'images'))
  if (page.logo && !images.has(page.logo)) {
    throw new Error(`page.yml logo "${page.logo}" not found in wiki/images`)
  }
  const version = readModuleVersion(readFileSync(resolve(modulePath, descriptorPath), 'utf8'))
  const product = readProduct(resolve(modulePath, 'dolistore', 'product.yml'))
  return { page, markdown, images, version, product }
}

function readPage(path) {
  if (!existsSync(path)) {
    throw new Error(`${path} not found`)
  }
  const data = YAML.parse(readFileSync(path, 'utf8')) ?? {}
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${path}: a mapping is expected`)
  }
  for (const key of Object.keys(data)) {
    if (!PAGE_KEYS.includes(key)) {
      throw new Error(`${path}: unknown key "${key}" (allowed: ${PAGE_KEYS.join(', ')})`)
    }
  }
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  if (!title) {
    throw new Error(`${path}: title is required`)
  }
  if (BAD_TITLE.test(title)) {
    throw new Error(`${path}: the title cannot contain [ ] { } | # < >`)
  }
  const imagePrefix = data.image_prefix === undefined ? title.replace(/[^A-Za-z0-9_-]/g, '') : String(data.image_prefix)
  if (!/^[A-Za-z0-9_-]+$/.test(imagePrefix)) {
    throw new Error(`${path}: image_prefix must use letters, digits, "-" and "_" only (set it when the title has none)`)
  }
  if (data.logo !== undefined && typeof data.logo !== 'string') {
    throw new Error(`${path}: logo must be a file name of wiki/images`)
  }
  if (data.download !== undefined && !/^https:\/\/\S+$/.test(String(data.download))) {
    throw new Error(`${path}: download must be an https:// URL`)
  }
  return { title, logo: data.logo ?? null, imagePrefix, download: data.download ?? null }
}

function readImages(dir) {
  const images = new Map()
  if (!existsSync(dir)) {
    return images
  }
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) {
      continue
    }
    const path = join(dir, name)
    if (!statSync(path).isFile()) {
      throw new Error(`${path}: sub-folders are not supported in wiki/images`)
    }
    if (!IMAGE_NAME.test(name)) {
      throw new Error(`${path}: image names use letters, digits, ".", "-" and "_" and end with .png, .jpg, .jpeg or .gif`)
    }
    images.set(name, path)
  }
  return images
}

// Only what the header needs; dolistore-sync validates this file
function readProduct(path) {
  if (!existsSync(path)) {
    return null
  }
  const data = YAML.parse(readFileSync(path, 'utf8')) ?? {}
  return { id: data.id ?? null, dolibarr: data.dolibarr ?? null, php: data.php ?? null }
}
