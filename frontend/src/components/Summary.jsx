// Renders the model's plain-text summary: paragraphs, "Heading:" lines, bullet lists,
// **bold**, and [n] citations that jump to the matching source card.
import { parseBlocks, parseInline } from '../lib/summary.js'

function Inline({ text, sourceCount, onCite }) {
  return parseInline(text, sourceCount).map((token, i) => {
    if (token.type === 'cite')
      return (
        <button key={i} className="cite" onClick={() => onCite(token.n)} title={`Jump to source ${token.n}`}>
          {token.n}
        </button>
      )
    if (token.type === 'bold') return <strong key={i}>{token.text}</strong>
    return <span key={i}>{token.text}</span>
  })
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
