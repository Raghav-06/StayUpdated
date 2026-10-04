// Renders the model's plain-text summary: paragraphs, "Heading:" lines, bullet lists,
// **bold**, and [n] citations that jump to the matching source card.

const HEADING_RE = /^(?:#{1,4}\s*)?(?:\d+\.\s*)?\**([A-Z][^.!?]{2,60}):\**\s*$/
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/

function Inline({ text, sourceCount, onCite }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean)
  return parts.map((part, i) => {
    const cite = /^\[(\d+)\]$/.exec(part)
    if (cite) {
      const n = Number(cite[1])
      if (n < 1 || n > sourceCount) return null
      return (
        <button key={i} className="cite" onClick={() => onCite(n)} title={`Jump to source ${n}`}>
          {n}
        </button>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    return <span key={i}>{part}</span>
  })
}

function parseBlocks(text) {
  const blocks = []
  for (const raw of text.split('\n')) {
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

export function Summary({ text, sourceCount, onCite }) {
  const blocks = parseBlocks(text)
  return (
    <div className="summary">
      {blocks.map((b, i) => {
        if (b.type === 'heading') return <h3 key={i}>{b.text}</h3>
        if (b.type === 'list')
          return (
            <ul key={i}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} sourceCount={sourceCount} onCite={onCite} />
                </li>
              ))}
            </ul>
          )
        return (
          <p key={i}>
            <Inline text={b.text} sourceCount={sourceCount} onCite={onCite} />
          </p>
        )
      })}
    </div>
  )
}
