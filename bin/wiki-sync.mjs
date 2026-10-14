#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { basename, resolve } from 'node:path'
import { run } from '../src/run.mjs'
import { WikiApi } from '../src/api.mjs'

const DEFAULT_API = 'https://wiki.netlogic.fr/api.php'
const USAGE = `Usage: wiki-sync --descriptor <path> [--module <dir>] [--out <dir>] [--api <url>] [--source <url>] [--submit [--force]]

Without --submit: dry-run, writes page.wiki, diff.txt and preview.html in --out (default: out), no login.
--submit changes the wiki; it needs WIKI_LOGIN and WIKI_PASSWORD (a bot password) in the environment.
--force takes over a page never synced by wiki-sync or edited by hand since (its manual changes are lost).`

async function main() {
  const { values } = parseArgs({
    options: {
      module: { type: 'string', default: '.' },
      descriptor: { type: 'string' },
      out: { type: 'string', default: 'out' },
      api: { type: 'string', default: DEFAULT_API },
      source: { type: 'string' },
      submit: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false }
    }
  })
  if (values.help) {
    console.log(USAGE)
    return
  }
  if (!values.descriptor) {
    throw new Error(`--descriptor is required\n${USAGE}`)
  }
  let credentials = null
  if (values.submit) {
    const { WIKI_LOGIN: login, WIKI_PASSWORD: password } = process.env
    if (!login || !password) {
      throw new Error('--submit needs WIKI_LOGIN and WIKI_PASSWORD in the environment')
    }
    credentials = { login, password }
  }
  const result = await run({
    modulePath: values.module,
    descriptor: values.descriptor,
    out: values.out,
    api: new WikiApi({ apiUrl: values.api }),
    apiUrl: values.api,
    repository: process.env.GITHUB_REPOSITORY || basename(resolve(values.module)),
    submit: values.submit,
    force: values.force,
    sourceUrl: values.source ?? null,
    credentials
  })
  console.log(`Done: ${result.status}`)
}

main().catch(error => {
  console.error(`wiki-sync: ${error.message}`)
  process.exit(1)
})
