import { useRef } from 'react'

// Six single-digit boxes that behave like one input (typing, backspace, paste).
export function CodeInput({ value, onChange, disabled }) {
  const refs = useRef([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  function setAt(index, char) {
    const next = digits.slice()
    next[index] = char
    onChange(next.join('').replace(/\s+$/, '').replace(/\s/g, ''))
  }

  function handleChange(index, raw) {
    const clean = raw.replace(/\D/g, '')
    if (!clean) return
    if (clean.length > 1) {
      onChange((value.slice(0, index) + clean).slice(0, 6))
      refs.current[Math.min(index + clean.length, 5)]?.focus()
      return
    }
    setAt(index, clean)
    refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index].trim()) setAt(index, ' ')
      else if (index > 0) {
        setAt(index - 1, ' ')
        refs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft') refs.current[index - 1]?.focus()
    else if (e.key === 'ArrowRight') refs.current[index + 1]?.focus()
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    refs.current[Math.min(pasted.length, 5)]?.focus()
  }

  return (
    <div className="code-input" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="code-box"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          value={d.trim()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )
}
