/**
 * Resizable split for a seat that carries a shipped component plus sections.
 *
 * The layout is domain-free: a main pane that takes the remaining space, a drag
 * handle, and a bottom pane whose share is persisted. Persistence goes through
 * the client store engine DSH already uses for view state (`defineStore` +
 * `persist`), so the value lives beside the shipped view state instead of in a
 * private key scheme of our own.
 */
import { useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'

/** Persisted shape: one ratio per seat, so two split seats never fight. */
export interface SplitState {
  ratios: Record<string, number>
}

/** The store face a split pane reads and writes. */
export interface SplitStore {
  getSnapshot(): SplitState
  subscribe(listener: () => void): () => void
  actions: { setRatio(slot: string, ratio: number): void }
}

/** Share of the seat the bottom pane takes before anyone drags it. */
export const DEFAULT_SPLIT_RATIO = 0.5
/** Smallest bottom pane, in pixels. */
export const MIN_SPLIT_PX = 120
/** Largest bottom pane, as a share of the seat. */
export const MAX_SPLIT_RATIO = 0.8

export interface SplitPaneProps {
  store: SplitStore
  /** Seat identity the persisted ratio belongs to. */
  slot: string
  top: ReactNode
  bottom: ReactNode
  defaultRatio?: number
  minPx?: number
  maxRatio?: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * Draw the main pane, a drag handle, and the resizable bottom pane.
 * @param props.store - persisted ratio store.
 * @param props.slot - seat identity the ratio is stored under.
 * @param props.top - main pane (the shipped component).
 * @param props.bottom - bottom pane (region sections).
 * @returns the split layout.
 */
export function SplitPane({
  store, slot, top, bottom,
  defaultRatio = DEFAULT_SPLIT_RATIO,
  minPx = MIN_SPLIT_PX,
  maxRatio = MAX_SPLIT_RATIO,
}: SplitPaneProps): ReactNode {
  const root = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const stored = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().ratios[slot] ?? defaultRatio,
    () => defaultRatio,
  )
  const ratio = dragging ?? stored

  const commit = (next: number): void => {
    store.actions.setRatio(slot, next)
  }

  const ratioFromPointer = (clientY: number): number => {
    const box = root.current?.getBoundingClientRect()
    if (box === undefined || box.height <= 0) return ratio
    const bottomPx = box.bottom - clientY
    return clamp(bottomPx / box.height, minPx / box.height, maxRatio)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    // Capture keeps the drag alive when the pointer leaves the 6px handle.
    // A synthetic pointer (tests, automation) has no capture target; the drag
    // still works from the element's own move events.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // ignore: no active pointer to capture
    }
    setDragging(ratioFromPointer(event.clientY))
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragging === null) return
    setDragging(ratioFromPointer(event.clientY))
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragging === null) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore: nothing was captured
    }
    setDragging(null)
    commit(dragging)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      commit(clamp(stored + step, 0, maxRatio))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      commit(clamp(stored - step, 0, maxRatio))
    }
  }

  return (
    <div ref={root} style={ROOT} data-proton-split={slot}>
      <div style={TOP}>{top}</div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        style={dragging === null ? HANDLE : DRAGGING_HANDLE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <div style={{ ...BOTTOM, flexBasis: `${String(ratio * 100)}%`, maxHeight: `${String(maxRatio * 100)}%`, minHeight: minPx }}>
        {bottom}
      </div>
    </div>
  )
}

const ROOT: CSSProperties = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
const TOP: CSSProperties = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
const BOTTOM: CSSProperties = { flexGrow: 0, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }
const HANDLE: CSSProperties = {
  flex: 'none', height: 6, cursor: 'row-resize', background: 'transparent',
  borderTop: '1px solid var(--dsw-alias-border-l4)', touchAction: 'none',
}
const DRAGGING_HANDLE: CSSProperties = { ...HANDLE, background: 'var(--dsw-alias-interactive-bg-hover)' }
