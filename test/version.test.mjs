import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readModuleVersion } from '../src/version.mjs'

test('reads the version of the descriptor', () => {
  assert.equal(readModuleVersion("\t\t$this->version = '2.0.4';\n"), '2.0.4')
})

test('ignores a commented version line', () => {
  assert.equal(readModuleVersion("\t\t// $this->version = '1.0';\n\t\t$this->version = '2.1';\n"), '2.1')
})

test('throws when there is no version', () => {
  assert.throws(() => readModuleVersion("$this->version = 'dolibarr';\n"), /Module version not found/)
})
