import { describe, expect, it } from 'vitest'
import { toMarkdown } from './share.js'

const result = {
  topic: 'Solar   power\nin India',
  region: 'IN',
  summary: 'Output hit a record [1]. Off-range [9].\n\nKey points:\n- Farms approved [2]\n- Storage grows [1][2]',
  sources: [
    { id: 1, title: 'Record [solar] day', url: 'https://news.example.com/a', source: 'Example News' },
    { id: 2, title: '', url: 'https://example.org/path (with) spaces' },
  ],
}

describe('toMarkdown', () => {
  const md = toMarkdown(result)

  it('starts with the topic on one line and the meta line', () => {
    const [title, , meta] = md.split('\n')
    expect(title).toBe('# Solar power in India')
    expect(meta).toContain('2 sources')
    expect(meta).toContain('made with StayUpdated')
  })

  it('keeps valid [n] citations, drops out-of-range ones, and keeps the structure', () => {
    expect(md).toContain('## Summary')
    expect(md).toContain('Output hit a record [1].')
    expect(md).not.toContain('[9]')
    expect(md).toContain('### Key points')
    expect(md).toContain('- Farms approved [2]')
    expect(md).toContain('- Storage grows [1][2]')
  })

  it('lists numbered sources with safe links and reference definitions', () => {
    expect(md).toContain('1. [Record \\[solar\\] day](https://news.example.com/a) — Example News')
    expect(md).toContain('2. [https://example.org/path (with) spaces](<https://example.org/path (with) spaces>)')
    expect(md).toContain('[1]: https://news.example.com/a')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('works without a summary or sources', () => {
    expect(toMarkdown({ topic: 'Empty', sources: [] })).not.toContain('## Sources')
  })
})
