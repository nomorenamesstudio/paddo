/**
 * Draws Paddō's placeholder app icons — paper, three text rules, one accent
 * dot — and writes them as PNGs without pulling in an image library.
 *
 * Usage: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'

const PAPER = [0xf7, 0xf4, 0xef]
const INK = [0x2a, 0x28, 0x25]
const ACCENT = [0x9a, 0x34, 0x12]

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, draw) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a = 255] = draw(x, y)
      const at = (y * size + x) * 4
      pixels[at] = r
      pixels[at + 1] = g
      pixels[at + 2] = b
      pixels[at + 3] = a
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function design(size) {
  const unit = size / 100
  const margin = 22 * unit
  const rules = [34, 45, 56, 67].map((y) => y * unit)
  const thickness = Math.max(1, 2.6 * unit)
  const lastRuleEnd = 78 * unit
  const dotRadius = 5.5 * unit
  const dotCenter = { x: 74 * unit, y: 76 * unit }

  return (x, y) => {
    const inDot = Math.hypot(x - dotCenter.x, y - dotCenter.y) <= dotRadius
    if (inDot) return ACCENT

    for (const ruleY of rules) {
      if (y >= ruleY && y <= ruleY + thickness && x >= margin && x <= lastRuleEnd) return INK
    }

    return PAPER
  }
}

await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true })

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const target = new URL(`../public/icons/${name}`, import.meta.url)
  await writeFile(target, png(size, design(size)))
  console.log(`wrote public/icons/${name} (${size}×${size})`)
}
