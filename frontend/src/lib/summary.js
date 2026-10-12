// Parses the model's plain-text summary: paragraphs, "Heading:" lines, bullet lists,
// **bold**, and [n] citations (only 1..sourceCount; anything else is dropped).

const HEADING_RE = /^(?:#{1,4}\s*)?(?:\d+\.\s*)?\**([A-Z][^.!?]{2,60}):\**\s*$/
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/

/** Lines -> [{ type: 'heading', text } | { type: 'list', items } | { type: 'p', text }] */
export function parseBlocks(text) {
  const blocks = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', text: heading[1] })
    } else if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, '')
      const last = blocks.at(-1)
      if (last?.type === 'list') last.items.push(item)
      else blocks.push({ type: 'list', items: [item] })
    } else {
      blocks.push({ type: 'p', text: line.replace(/^#+\s*/, '') })
    }
  }
  return blocks
}

/** One line -> [{ type: 'text' | 'bold', text } | { type: 'cite', n }] */
export function parseInline(text, sourceCount) {
  const tokens = []
  for (const part of text.split(/(\*\*[^*]+\*\*|\[\d+\])/g)) {
    if (!part) continue
    const cite = /^\[(\d+)\]$/.exec(part)
    if (cite) {
      const n = Number(cite[1])
      if (n >= 1 && n <= sourceCount) tokens.push({ type: 'cite', n })
    } else if (part.startsWith('**') && part.endsWith('**')) {
      tokens.push({ type: 'bold', text: part.slice(2, -2) })
    } else {
      tokens.push({ type: 'text', text: part })
    }
  }
  return tokens
}

/** Removes [n] markers that don't point at a real source. */
export function dropInvalidCitations(text, sourceCount) {
  return text.replace(/\s*\[(\d+)\]/g, (match, n) => (Number(n) >= 1 && Number(n) <= sourceCount ? match : ''))
}
