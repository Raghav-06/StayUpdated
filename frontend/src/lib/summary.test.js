import { describe, expect, it } from 'vitest'
import { dropInvalidCitations, parseBlocks, parseInline } from './summary.js'

describe('parseBlocks', () => {
  it('splits a summary into paragraphs, headings and bullet lists', () => {
    const text = [
      'Solar output hit a record this week [1].',
      '',
      'Key points:',
      '- Record share of the grid [1]',
      '* New farms approved [2]',
      '1. Storage is growing',
      '## What people are saying:',
      '• Mostly positive [3]',
    ].join('\n')

    expect(parseBlocks(text)).toEqual([
      { type: 'p', text: 'Solar output hit a record this week [1].' },
      { type: 'heading', text: 'Key points' },
      { type: 'list', items: ['Record share of the grid [1]', 'New farms approved [2]', 'Storage is growing'] },
      { type: 'heading', text: 'What people are saying' },
      { type: 'list', items: ['Mostly positive [3]'] },
    ])
  })

  it('treats **bold** headings and markdown # prefixes as headings, and handles empty input', () => {
    expect(parseBlocks('**Overview:**\n# Plain title line')).toEqual([
      { type: 'heading', text: 'Overview' },
      { type: 'p', text: 'Plain title line' },
    ])
    expect(parseBlocks(null)).toEqual([])
  })
})

describe('parseInline', () => {
  it('finds citations, bold text and plain text', () => {
    expect(parseInline('Prices **rose** sharply [1][2].', 2)).toEqual([
      { type: 'text', text: 'Prices ' },
      { type: 'bold', text: 'rose' },
      { type: 'text', text: ' sharply ' },
      { type: 'cite', n: 1 },
      { type: 'cite', n: 2 },
      { type: 'text', text: '.' },
    ])
  })

  it('ignores citations outside 1..sourceCount', () => {
    expect(parseInline('Claim [0] [3] [99] [2]', 2).filter((t) => t.type === 'cite')).toEqual([{ type: 'cite', n: 2 }])
  })
})

describe('dropInvalidCitations', () => {
  it('removes only out-of-range markers', () => {
    expect(dropInvalidCitations('A [1] and B [7][2].', 2)).toBe('A [1] and B[2].')
  })
})
