import { describe, expect, it } from 'vitest'
import { LIMITS, validateSelection } from './validation'

const f = (name: string, type: string, size = 10, lastModified = 1) =>
  new File([new Uint8Array(size)], name, { type, lastModified })

describe('validateSelection', () => {
  it('accepts a valid selection', () => {
    expect(validateSelection([f('a.png', 'image/png'), f('b.mp4', 'video/mp4')])).toEqual([])
  })
  it('rejects 0 and >10 files', () => {
    expect(validateSelection([])).toHaveLength(1)
    const many = Array.from({ length: 11 }, (_, i) => f(`${i}.png`, 'image/png', 10 + i))
    expect(validateSelection(many)[0]).toMatch(/between 1 and 10/)
  })
  it('rejects bad MIME, empty file and oversize', () => {
    expect(validateSelection([f('a.pdf', 'application/pdf')])[0]).toMatch(/unsupported/)
    expect(validateSelection([f('a.png', 'image/png', 0)])[0]).toMatch(/empty/)
    const big = f('a.png', 'image/png')
    Object.defineProperty(big, 'size', { value: LIMITS.image.maxBytes + 1 })
    expect(validateSelection([big])[0]).toMatch(/larger than/)
  })
  it('rejects duplicates', () => {
    expect(validateSelection([f('a.png', 'image/png'), f('a.png', 'image/png')])[0]).toMatch(/more than once/)
  })
  it('thumbnail must be an image; prompt max 2000', () => {
    expect(validateSelection([f('a.png', 'image/png')], f('t.mp4', 'video/mp4'))[0]).toMatch(/Thumbnail/)
    expect(validateSelection([f('a.png', 'image/png')], undefined, 'x'.repeat(2001))[0]).toMatch(/2000/)
  })
})
