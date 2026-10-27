/** Puts the saved theme back to what his device says. */
import { readFile, writeFile } from 'node:fs/promises'
const path = '.paddo/settings.json'
const settings = JSON.parse(await readFile(path, 'utf8'))
settings.theme = 'system'
await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
const check = JSON.parse(await readFile(path, 'utf8'))
console.log('theme:', check.theme, '| guide bytes:', check.writingGuide.length)
