export function readModuleVersion(descriptorSource) {
  const match = descriptorSource.match(/^[ \t]*\$this->version\s*=\s*'([0-9][^']*)'/m)
  if (!match) {
    throw new Error('Module version not found in the descriptor ($this->version = \'x.y.z\')')
  }
  return match[1]
}
