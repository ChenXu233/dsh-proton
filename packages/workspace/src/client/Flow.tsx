import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DirectoryFlowContext } from 'dsh-proton-adapter-dsh/client'
import type { CollectedCandidate, WorkspaceSources } from './sources'

export interface WorkspaceFlowProps {
  context: DirectoryFlowContext
  sources: WorkspaceSources
  next: () => ReactNode
}

type FlowMode = 'choice' | 'local' | 'remote'

/** Decorate the shipped directory flow with every registered workspace source. */
export function WorkspaceFlow({ context, sources, next }: WorkspaceFlowProps) {
  const [mode, setMode] = useState<FlowMode>('choice')
  const [rows, setRows] = useState<readonly CollectedCandidate[]>([])
  const [failures, setFailures] = useState<readonly { sourceId: string; message: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const operation = useRef(0)
  const pendingRef = useRef(false)
  const latest = useRef(context)
  latest.current = context
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<() => void>(() => {})
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!context.open || mode !== 'remote') return
    let active = true
    setLoading(true)
    void sources.collect().then(result => {
      if (!active) return
      setRows(result.rows)
      setFailures(result.failures)
      if (result.rows.length === 0 && result.failures.length > 0) {
        latest.current.onError(result.failures.map(failure => failure.message).join('; '))
      }
    }).catch(reason => {
      if (active) latest.current.onError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [context.open, mode, sources])

  useEffect(() => {
    if (context.open) return
    operation.current += 1
    pendingRef.current = false
    setPending(false)
    setMode('choice')
    setRows([])
    setFailures([])
  }, [context.open])

  useEffect(() => () => {
    operation.current += 1
    pendingRef.current = false
  }, [])

  const close = (): void => {
    if (latest.current.busy) return
    operation.current += 1
    pendingRef.current = false
    setPending(false)
    latest.current.onCancel()
  }
  closeRef.current = close

  useEffect(() => {
    if (!context.open || mode === 'local' || typeof document === 'undefined') return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (dialog === null) return
      const controls = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      const first = controls[0]
      const last = controls.at(-1)
      if (first === undefined || last === undefined) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const active = document.activeElement
      const outside = active === null || !dialog.contains(active)
      if (event.shiftKey && (active === first || active === dialog || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || active === dialog || outside)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [context.open, mode])

  if (!context.open || mode === 'local') return next()

  const busy = context.busy || loading || pending
  const runChoice = async (choose: () => Promise<string | null>): Promise<void> => {
    if (pendingRef.current || latest.current.busy) return
    pendingRef.current = true
    setPending(true)
    const ticket = ++operation.current
    try {
      const path = await choose()
      if (ticket !== operation.current || !latest.current.open) return
      if (path === null) latest.current.onCancel()
      else latest.current.onPicked(path)
    } catch (reason) {
      if (ticket === operation.current) latest.current.onError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (ticket === operation.current) {
        pendingRef.current = false
        setPending(false)
      }
    }
  }

  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="proton-workspace-title"
    style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.38)' }}>
    <section style={{ width: 'min(560px, calc(100vw - 32px))', maxHeight: '80vh', overflow: 'auto', padding: 24,
      borderRadius: 16, background: 'var(--dsh-bg-base, #171717)', color: 'var(--dsh-text-primary, #eee)',
      boxShadow: '0 24px 80px rgba(0,0,0,.35)' }}>
      <h2 id="proton-workspace-title">添加工作区</h2>
      {mode === 'choice' ? <>
        <p>使用原来的本机目录流程，或登记一个由已注册来源提供的工作区。</p>
        <button type="button" disabled={context.busy} onClick={() => { setMode('local') }}>选择本机目录…</button>
        <button type="button" disabled={context.busy} onClick={() => { setMode('remote') }}>选择远端工作区…</button>
      </> : <>
        <p>登记只创建本地锚点；执行归属由提供该工作区的来源负责。</p>
        <h3>来源</h3>
        {loading ? <p role="status">正在读取工作区来源…</p> : null}
        {!loading && rows.length === 0 && failures.length === 0
          ? <p>没有已注册的工作区来源。</p>
          : null}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {rows.map(row => <li key={`${row.sourceId}/${row.candidate.id}`}>
            <button type="button" disabled={busy}
              onClick={() => { void runChoice(async () => (await sources.adopt(row.sourceId, row.candidate.id)).path) }}
              style={{ width: '100%', textAlign: 'left', padding: 12 }}>
              <strong>{row.candidate.title}</strong>
              <span style={{ display: 'block', opacity: .7 }}>
                {row.candidate.detail === undefined ? row.sourceLabel : `${row.candidate.detail} · ${row.sourceLabel}`}
                {row.candidate.status === 'online' ? '' : ` · ${row.candidate.status}`}
              </span>
            </button>
          </li>)}
        </ul>
        {failures.map(failure => <p key={failure.sourceId} role="alert" style={{ opacity: .8 }}>
          {failure.sourceId}: {failure.message}
        </p>)}
      </>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" disabled={context.busy} onClick={close}>取消</button>
      </div>
    </section>
  </div>
}
