/**
 * The workspace picker's entry face.
 *
 * The shipped picker (the menu behind the hero's workspace chip) reads the real
 * Workspace registry through the root `useWorkspaces` hook and knows nothing
 * about other machines. A workspace domain that holds a second, non-local set of
 * workspaces cannot add a section to that menu — the component owns its list.
 *
 * What it can do is hand the same entry a different kit: the picker reads
 * whatever `useWorkspaces` answers with, so this face merges extra rows into
 * that snapshot for this seat only (the sidebar and every other reader of the
 * root hook stay untouched), and wraps `onPick` so a row that is not a local
 * Workspace is handled by its owner instead of becoming a Session on this Host.
 * The component itself is still the shipped one, rendered through the entry
 * face — no fork, no re-registration.
 */
import { useMemo, useSyncExternalStore } from 'react'
import type { EntryKitSources } from 'dsh-proton/client'

/** One row a domain adds to the workspace picker. */
export interface PickerRow {
  /** Synthetic id; must not collide with a real Workspace id. */
  readonly workspaceId: string
  /** Menu label. The picker has no separate machine cell, so the owner chooses what to spell here. */
  readonly title: string
}

/** What a domain adds to the picker. */
export interface PickerExtras {
  /** Extra rows, as an observable so the open menu follows the owner's snapshot. */
  readonly rows: {
    getSnapshot(): readonly PickerRow[]
    subscribe(listener: () => void): () => void
  }
  /**
   * Handle one pick of an extra row.
   * @param workspaceId - the synthetic id the row carried.
   * @returns true when handled (no local Session may be created), false to fall through.
   */
  pick(workspaceId: string): boolean
  /** Synthetic id to show as the current choice, or undefined for the real selection. */
  selectedId?(): string | undefined
}

/** Selector-hook shape the shipped picker consumes. */
type UseWorkspaces = (selector: (snapshot: unknown) => unknown) => unknown

/** The workspace controller list as this face reads it. */
interface WorkspaceListLike {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

/** Fields of the picker's owner props this face touches. */
interface PickerOwner {
  onPick?: (workspaceId: string) => void
  onClose?: () => void
  selectedId?: string | undefined
  [key: string]: unknown
}

/** The stored entry as this face inspects it (opaque to the host). */
interface RawEntry {
  children?: Record<string, unknown>
}

const EMPTY_ROWS: readonly PickerRow[] = []

/**
 * Whether a stored entry is the shipped hero picker.
 * @param entry - entry under inspection.
 * @returns true for the picker registration.
 */
export function isPickerEntry(entry: RawEntry): boolean {
  return entry.children !== undefined && 'conversation.hero.workspace.directoryFlow' in entry.children
}

/**
 * One selector hook that answers with the real snapshot plus the extras.
 *
 * The base hook is the domain's own bound hook (it already owns the stable
 * subscribe/getSnapshot pair); the extras ride a second stable pair. A fresh
 * pair per render would resubscribe every frame.
 * @param base - the domain's `useWorkspaces`.
 * @param extrasOf - current extras, if a domain registered any.
 * @returns the hook the picker receives.
 */
function mergedHook(base: UseWorkspaces, extrasOf: () => PickerExtras | undefined): UseWorkspaces {
  return function useWorkspaces(selector: (snapshot: unknown) => unknown): unknown {
    const snapshot = base(identity) as { items?: readonly unknown[] }
    const extras = extrasOf()
    const subscribe = useMemo(
      () => (listener: () => void) => (extras === undefined ? () => {} : extras.rows.subscribe(listener)),
      [extras],
    )
    const getSnapshot = useMemo(
      () => () => (extras === undefined ? EMPTY_ROWS : extras.rows.getSnapshot()),
      [extras],
    )
    const extraRows = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const merged = useMemo(() => {
      if (extraRows.length === 0) return snapshot
      const items = snapshot.items ?? []
      return { ...snapshot, items: [...items, ...extraRows] }
    }, [snapshot, extraRows])
    return selector(merged)
  }
}

/** Pass-through selector for the base hook. */
function identity(snapshot: unknown): unknown {
  return snapshot
}

/**
 * Build the kit for the picker entry.
 * @param ctx - client root context (for the entry face).
 * @param sources - locale binder and the domain's base hook.
 * @param extrasOf - current picker extras.
 * @returns kit sources that draw the shipped picker with merged rows.
 */
export function pickerSources(
  ctx: { proton: { entryFace(entry: unknown, sources?: EntryKitSources): unknown } },
  sources: { translate?: (namespace: string) => unknown, baseHook?: UseWorkspaces },
  extrasOf: () => PickerExtras | undefined,
): EntryKitSources {
  const base = sources.baseHook
  const standard = base === undefined ? {} : { useWorkspaces: mergedHook(base, extrasOf) }
  return {
    draw: (entry, owner) => {
      const seat = owner as PickerOwner
      const extras = extrasOf()
      // The slot renderer hands its standard props to the seat as owner props;
      // its `useWorkspaces` would override this face's merged one. Drop it and
      // let the kit supply the merged list.
      const { useWorkspaces: _seatHook, ...seatRest } = seat as PickerOwner & { useWorkspaces?: unknown }
      const wrapped: PickerOwner = {
        ...seatRest,
        onPick: (workspaceId: string) => {
          if (extras !== undefined && extras.pick(workspaceId)) {
            // The synthetic row is not a local Workspace: the owner must close
            // the menu itself instead of starting a Session it cannot create.
            seat.onClose?.()
            return
          }
          seat.onPick?.(workspaceId)
        },
      }
      const chosen = extras?.selectedId?.()
      if (chosen !== undefined) wrapped.selectedId = chosen
      return ctx.proton.entryFace(entry, {
        ...(sources.translate === undefined ? {} : { translate: sources.translate }),
        standard,
        owner: wrapped,
      }) as never
    },
  }
}

/** The observable face a picker extras source must implement. */
export function isPickerRow(value: unknown): value is PickerRow {
  return typeof value === 'object' && value !== null
    && typeof (value as { workspaceId?: unknown }).workspaceId === 'string'
    && typeof (value as { title?: unknown }).title === 'string'
}

