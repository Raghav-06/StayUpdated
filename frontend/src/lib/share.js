import { dropInvalidCitations, parseBlocks } from './summary.js'
import { regionLabel } from './regions.js'

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

// URLs with spaces or parentheses must be wrapped in <> to stay one link.
function linkTarget(url) {
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url
}

// Escapes characters that would break a Markdown link label.
function linkLabel(text) {
  return oneLine(text).replace(/([[\]\\])/g, '\\$1')
}

// The summary's headings, bullets and paragraphs as proper Markdown blocks.
function summaryMarkdown(summary, sourceCount) {
  return parseBlocks(summary)
    .map((b) => {
      if (b.type === 'heading') return `### ${b.text}`
      if (b.type === 'list') return b.items.map((item) => `- ${dropInvalidCitations(item, sourceCount)}`).join('\n')
      return dropInvalidCitations(b.text, sourceCount)
    })
    .join('\n\n')
}

/**
 * The result as Markdown: topic, summary with [n] citations, then a numbered source list.
 * Reference-style definitions ([1]: url) make the citations clickable in Markdown viewers.
 */
export function toMarkdown(result) {
  const sources = result.sources ?? []
  const createdAt = result.createdAt ?? result.created_at
  const region = result.region ?? result.params?.region
  const meta = [
    createdAt && new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    region && regionLabel(region),
    `${sources.length} sources`,
  ].filter(Boolean)

  const lines = [`# ${oneLine(result.topic)}`, '', `_${meta.join(' · ')} · made with StayUpdated_`, '']
  if (result.summary) lines.push('## Summary', '', summaryMarkdown(result.summary, sources.length), '')
  if (sources.length) {
    lines.push('## Sources', '')
    for (const s of sources) {
      const details = [s.source, s.publishedAt && new Date(s.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })]
        .filter(Boolean)
        .join(', ')
      lines.push(`${s.id}. [${linkLabel(s.title || s.url)}](${linkTarget(s.url)})${details ? ` — ${oneLine(details)}` : ''}`)
    }
    lines.push('', ...sources.map((s) => `[${s.id}]: ${linkTarget(s.url)}`))
  }
  return lines.join('\n') + '\n'
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Older browsers / non-secure contexts: fall back to a hidden textarea.
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    if (!ok) throw new Error('Copying is not supported in this browser')
  }
}
