import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { copyText, toMarkdown } from '../lib/share.js'
import { CheckIcon, CloseIcon, CopyIcon, LinkIcon, ShareIcon } from './icons.jsx'

/** "Share" dropdown for a saved search: copy (and create) its public link, stop sharing, or copy it as Markdown. */
export function ShareMenu({ result }) {
  const [open, setOpen] = useState(false)
  const [shareId, setShareId] = useState(result.share_id ?? null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { kind: 'ok' | 'error', text }
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(id)
  }, [notice])

  async function run(action) {
    setBusy(true)
    try {
      setNotice({ kind: 'ok', text: await action() })
      setOpen(false)
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const copyLink = () =>
    run(async () => {
      const { shareId: id } = await api(`/news/history/${result.id}/share`, { method: 'POST' })
      setShareId(id)
      // Built from this page's origin so the link works wherever the app is hosted.
      await copyText(`${window.location.origin}/s/${id}`)
      return 'Link copied. Anyone with it can view this search.'
    })

  const stopSharing = () =>
    run(async () => {
      await api(`/news/history/${result.id}/share`, { method: 'DELETE' })
      setShareId(null)
      return 'Sharing stopped. The old link no longer works.'
    })

  const copyMarkdown = () =>
    run(async () => {
      await copyText(toMarkdown(result))
      return 'Copied as Markdown'
    })

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <ShareIcon width={16} height={16} /> Share
        {shareId && <span className="dot-live" title="This search has a public link" />}
      </button>
      {open && (
        <div className="menu panel" role="menu">
          <button role="menuitem" onClick={copyLink} disabled={busy}>
            <LinkIcon width={16} height={16} />
            <span>
              Copy link
              <small>{shareId ? 'Anyone with the link can view' : 'Creates a public read-only link'}</small>
            </span>
          </button>
          {shareId && (
            <button role="menuitem" onClick={stopSharing} disabled={busy} className="danger">
              <CloseIcon width={16} height={16} />
              <span>Stop sharing</span>
            </button>
          )}
          <button role="menuitem" onClick={copyMarkdown} disabled={busy}>
            <CopyIcon width={16} height={16} />
            <span>Copy as Markdown</span>
          </button>
        </div>
      )}
      {notice && (
        <div className={`menu-notice ${notice.kind}`} role="status">
          {notice.kind === 'ok' && <CheckIcon width={14} height={14} />} {notice.text}
        </div>
      )}
    </div>
  )
}
