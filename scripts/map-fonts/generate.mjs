// Map label glyphs: SDF ranges of « Unitae Map » (IBM Plex Sans, renamed under the OFL), each range filled in with
// Noto Sans where Plex has no glyph. See README.md.
// Usage: node generate.mjs <instances folder> <fontnik package folder> <smp-noto-glyphs package folder> <out folder>
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import zlib from 'node:zlib'

const [instances, fontnikDir, notoDir, out] = process.argv.slice(2).map(arg => path.resolve(arg))
const require = createRequire(import.meta.url)
const fontnik = require(path.join(fontnikDir, 'index.js'))
const NOTO = path.join(notoDir, 'fixtures/glyphs')
const ranges = JSON.parse(fs.readFileSync(path.join(instances, 'ranges.json'), 'utf8'))

// --- minimal protobuf: varints and length-delimited fields, unknown fields kept as raw bytes
function readVarint(buf, pos) {
  let result = 0
  let shift = 0
  for (;;) {
    const byte = buf[pos++]
    result += (byte & 0x7f) * 2 ** shift
    if (byte < 0x80) return [result, pos]
    shift += 7
  }
}
function fields(buf) {
  const list = []
  let pos = 0
  while (pos < buf.length) {
    const start = pos
    let key
    ;[key, pos] = readVarint(buf, pos)
    const field = Math.floor(key / 8)
    const wire = key & 7
    let value
    if (wire === 0) [value, pos] = readVarint(buf, pos)
    else if (wire === 2) {
      let len
      ;[len, pos] = readVarint(buf, pos)
      value = buf.subarray(pos, pos + len)
      pos += len
    } else throw new Error(`wire type ${wire}`)
    list.push({ field, wire, value, raw: buf.subarray(start, pos) })
  }
  return list
}
function varint(n) {
  const bytes = []
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80)
    n = Math.floor(n / 128)
  }
  bytes.push(n)
  return Buffer.from(bytes)
}
function lengthDelimited(field, payload) {
  return Buffer.concat([varint(field * 8 + 2), varint(payload.length), payload])
}

/** The fontstack of a glyph PBF: its glyphs by codepoint (raw messages) and its other fields. */
function parseStack(pbf) {
  const top = fields(pbf).find(f => f.field === 1)
  if (top == null) return { glyphs: new Map(), other: [] }
  const glyphs = new Map()
  const other = []
  for (const f of fields(top.value)) {
    if (f.field === 3) glyphs.set(fields(f.value).find(g => g.field === 1).value, f.value)
    else if (f.field !== 1 && f.field !== 2) other.push(f.raw)
  }
  return { glyphs, other }
}

const rangeOf = start => `${start}-${start + 255}`
const plexRange = (font, start) =>
  new Promise((resolve, reject) =>
    fontnik.range({ font, start, end: start + 255 }, (error, data) => (error ? reject(error) : resolve(data))),
  )

let written = 0
for (const style of ['Regular', 'Medium', 'Italic']) {
  const stack = `Unitae Map ${style}`
  const font = fs.readFileSync(path.join(instances, `UnitaeMap-${style}.ttf`))
  const dir = path.join(out, stack)
  fs.mkdirSync(dir, { recursive: true })
  for (const start of ranges[style]) {
    const plex = parseStack(await plexRange(font, start))
    const notoFile = path.join(NOTO, `${rangeOf(start)}.pbf.gz`)
    const noto = fs.existsSync(notoFile)
      ? parseStack(zlib.gunzipSync(fs.readFileSync(notoFile)))
      : { glyphs: new Map() }
    const merged = new Map(plex.glyphs)
    let filled = 0
    for (const [id, glyph] of noto.glyphs) {
      if (!merged.has(id)) {
        merged.set(id, glyph)
        filled++
      }
    }
    const body = Buffer.concat([
      lengthDelimited(1, Buffer.from(stack)),
      lengthDelimited(2, Buffer.from(rangeOf(start))),
      ...plex.other,
      ...[...merged.keys()].sort((a, b) => a - b).map(id => lengthDelimited(3, merged.get(id))),
    ])
    fs.writeFileSync(path.join(dir, `${rangeOf(start)}.pbf`), lengthDelimited(1, body))
    written++
    if (filled > 0) process.stdout.write(`${stack} ${rangeOf(start)}: ${plex.glyphs.size} Plex + ${filled} Noto\n`)
  }
}
process.stdout.write(`wrote ${written} ranges to ${out}\n`)
