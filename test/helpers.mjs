import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const DESCRIPTOR = 'core/modules/modPrune.class.php'

export function sha1(data) {
  return createHash('sha1').update(data).digest('hex')
}

// A module folder in a temp dir; an override set to null removes that file
export function makeModule(overrides = {}) {
  const files = {
    'wiki/page.yml': 'title: Prune\nlogo: logo.png\n',
    'wiki/fr.md': '# Présentation\n\nLe module **Prune**.\n\n![Écran](images/screen.png "800px")\n',
    'wiki/images/logo.png': Buffer.from('logo'),
    'wiki/images/screen.png': Buffer.from('screen'),
    'dolistore/product.yml': 'id: 646\ndolibarr: { min: V20, max: V24 }\nphp: { min: "7.4", max: "8.5" }\n',
    [DESCRIPTOR]: "<?php\nclass modPrune\n{\n\tpublic function __construct()\n\t{\n\t\t$this->version = '2.0.4';\n\t}\n}\n",
    ...overrides
  }
  const dir = mkdtempSync(join(tmpdir(), 'wiki-sync-'))
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}
