import { useRef, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { EntryKitSources } from 'dsh-proton/client'
import { isPickerEntry, pickerSources } from './picker'
import type { PickerExtras } from './picker'
import type { HiddenSessionSource } from './index'

/** Observable source the host would expose as a selector hook. */
interface ObservableLike<T = unknown> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}
/** Observable face of the workspace controller's list. */
interface WorkspaceListSource extends ObservableLike<unknown> {}
/** Locale service face: it binds a namespace to the stable translate seat. */
interface LocaleLike {
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}
/** The slice of the client context this package reads. */
interface RawEntry {
  component: unknown
  locale?: string
  registrant?: string | undefined
  /** Child slots the entry declared with its registration (the picker declares one). */
  children?: Record<string, unknown>
  store?: { create?: () => { getSnapshot?: () => unknown, subscribe?: (fn: () => void) => () => void, actions?: unknown } }
}

/**
 * One-level structural comparison, so a rebuilt snapshot is not mistaken for a
 * state change.
 * @param left - previous value.
 * @param right - candidate value.
 * @returns true when both have the same leaves.
 */
function shallowSame(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(key => key in b && a[key] === b[key])
}

const hookCache = new WeakMap<ObservableLike, (selector: (snapshot: never) => unknown) => unknown>()

/**
 * Selector hook for a source, bound once.
 *
 * The subscribe/getSnapshot pair must not be rebuilt per render: a source that
 * notifies on subscribe turns a fresh pair into an unbounded render loop.
 * @param source - observable with snapshot + subscribe.
 * @returns a stable selector hook.
 */
function selectorHook(source: WorkspaceListSource) {
  const cached = hookCache.get(source)
  if (cached !== undefined) return cached
  const built = function useSelector<T>(selector: (snapshot: never) => T): T {
    const subscribe = useRef((listener: () => void) => source.subscribe(listener)).current
    const holder = useRef<{ raw: unknown, selected: T } | undefined>(undefined)
    const selectorRef = useRef(selector)
    selectorRef.current = selector
    const getSnapshot = useRef((): T => {
      const raw = source.getSnapshot()
      const held = holder.current
      if (held !== undefined && held.raw === raw) return held.selected
      const selected = selectorRef.current(raw as never)
      if (held !== undefined && shallowSame(held.selected, selected)) {
        holder.current = { raw, selected: held.selected }
        return held.selected
      }
      holder.current = { raw, selected }
      return selected
    }).current
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }
  hookCache.set(source, built)
  return built
}

const storeInstances = new WeakMap<RawEntry, { useStore: unknown, actions: unknown }>()

/**
 * Bind an entry's declared store into the two props the host would hand over.
 * @param entry - the entry declaring the store.
 * @returns `useStore` and `actions`, or undefined when the seat has no store.
 */
function storeSeat(entry: RawEntry): { useStore: unknown, actions: unknown } | undefined {
  // One instance per entry: creating a store per render resubscribes every frame.
  const cached = storeInstances.get(entry)
  if (cached !== undefined) return cached
  const decl = entry.store
  if (decl === undefined || typeof decl.create !== 'function') return undefined
  const instance = decl.create()
  if (typeof instance.getSnapshot !== 'function' || typeof instance.subscribe !== 'function') return undefined

  function useStore<T>(selector: (snapshot: never) => T): T {
    const holder = useRef<{ raw: unknown, selected: T } | undefined>(undefined)
    const selectorRef = useRef(selector)
    selectorRef.current = selector
    const subscribe = useRef((listener: () => void) => instance.subscribe!(listener)).current
    const getSnapshot = useRef((): T => {
      const raw = instance.getSnapshot!()
      const held = holder.current
      if (held !== undefined && held.raw === raw) return held.selected
      const selected = selectorRef.current(raw as never)
      if (held !== undefined && shallowSame(held.selected, selected)) {
        holder.current = { raw, selected: held.selected }
        return held.selected
      }
      holder.current = { raw, selected }
      return selected
    }).current
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }

  const bound = { useStore, actions: instance.actions }
  storeInstances.set(entry, bound)
  return bound
}

/** The slice of the shipped session list the filter rewrites. */
interface SessionListLike {
  ids?: readonly string[]
  byId?: Record<string, unknown>
  [key: string]: unknown
}

/** The slice of the workspace list the filter rewrites. */
interface WorkspaceListLike {
  items?: readonly { sessionIds?: readonly string[], [key: string]: unknown }[]
  [key: string]: unknown
}

/** Subscribe one hidden-session source to React. */
function useHidden(source: HiddenSessionSource): readonly string[] {
  const subscribe = useRef((listener: () => void) => source.subscribe(listener)).current
  const getSnapshot = useRef(() => source.getSnapshot()).current
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Wrap the session-list hook so hidden Sessions leave both the order and the
 * summary map.
 *
 * Removing an id from the Workspace membership alone is not enough: the shipped
 * tree treats every summary no Workspace accounts for as an ungrouped Session
 * and would draw the row anyway.
 * @param base - the host's own hook.
 * @param hidden - ids to hide.
 * @returns the filtering hook, with a stable result for unchanged inputs.
 */
function sessionsWithout(
  base: (selector: (snapshot: never) => unknown) => unknown,
  hidden: HiddenSessionSource,
): (selector: (snapshot: never) => unknown) => unknown {
  let lastList: unknown
  let lastIds: readonly string[] | undefined
  let lastResult: SessionListLike | undefined
  return function useSessionsFiltered<T>(selector: (snapshot: never) => T): T {
    const ids = useHidden(hidden)
    const list = base(value => value) as SessionListLike
    let result = list
    if (ids.length > 0) {
      if (result !== lastList || ids !== lastIds || lastResult === undefined) {
        lastList = result
        lastIds = ids
        const hide = new Set(ids)
        const byId: Record<string, unknown> = {}
        for (const [id, summary] of Object.entries(list.byId ?? {})) {
          if (!hide.has(id)) byId[id] = summary
        }
        lastResult = { ...list, ids: (list.ids ?? []).filter(id => !hide.has(id)), byId }
      }
      result = lastResult ?? list
    }
    return selector === undefined ? result as T : selector(result as never)
  }
}

/**
 * Wrap the workspace-list hook so hidden Sessions leave every Workspace's
 * membership (the tree resolves rows from those ids).
 * @param base - the host's own hook.
 * @param hidden - ids to hide.
 * @returns the filtering hook, with a stable result for unchanged inputs.
 */
function workspacesWithout(
  base: (selector: (snapshot: never) => unknown) => unknown,
  hidden: HiddenSessionSource,
): (selector: (snapshot: never) => unknown) => unknown {
  let lastList: unknown
  let lastIds: readonly string[] | undefined
  let lastResult: WorkspaceListLike | undefined
  return function useWorkspacesFiltered<T>(selector: (snapshot: never) => T): T {
    const ids = useHidden(hidden)
    const list = base(value => value) as WorkspaceListLike
    let result = list
    if (ids.length > 0) {
      if (result !== lastList || ids !== lastIds || lastResult === undefined) {
        lastList = result
        lastIds = ids
        const hide = new Set(ids)
        lastResult = {
          ...list,
          items: (list.items ?? []).map((workspace) => {
            const members = workspace.sessionIds
            if (members === undefined || !members.some(id => hide.has(id))) return workspace
            return { ...workspace, sessionIds: members.filter(id => !hide.has(id)) }
          }),
        }
      }
      result = lastResult ?? list
    }
    return selector === undefined ? result as T : selector(result as never)
  }
}

/** Rewrite the kit's two list hooks when the composition hides Sessions. */
function tapListHooks(kit: Record<string, unknown>, hidden: HiddenSessionSource): Record<string, unknown> {
  const tapped = { ...kit }
  const sessions = kit['useSessions'] as ((selector: (snapshot: never) => unknown) => unknown) | undefined
  const workspaces = kit['useWorkspaces'] as ((selector: (snapshot: never) => unknown) => unknown) | undefined
  if (sessions !== undefined) tapped['useSessions'] = sessionsWithout(sessions, hidden)
  if (workspaces !== undefined) tapped['useWorkspaces'] = workspacesWithout(workspaces, hidden)
  return tapped
}

/**
 * Claim one entry and describe the kit the host renderer would have synthesized.
 *
 * Proton asks its providers in order; the first that answers draws the entry
 * through the entry face. This package claims the workspace namespace — the
 * shipped browser declares it.
 * @param ctx - client root context.
 * @param entry - the entry the outlet shadowed.
 * @returns kit sources, or undefined when this entry is not ours to draw.
 */
export function workspaceEntrySources(
  ctx: Context,
  entry: unknown,
  extrasOf: () => PickerExtras | undefined = () => undefined,
  hiddenOf: () => HiddenSessionSource | undefined = () => undefined,
): EntryKitSources | undefined {
  const declared = entry as RawEntry
  if (declared.locale !== 'workspace') return undefined
  const locale = (ctx as unknown as { locale?: LocaleLike }).locale
  const workspaces = (ctx as unknown as { workspaces?: { list: WorkspaceListSource } }).workspaces
  // The host synthesizes this seat from the declared namespace; the locale
  // service binds the same stable function, so keys and fallbacks agree.
  const translate = (namespace: string): unknown =>
    (locale === undefined ? (key: string) => key : locale.bind(namespace))

  // The hero picker is the one entry whose list a domain may extend: it reads
  // the root hook and nothing else, so the kit hands it a merged snapshot and a
  // pick face that knows which rows are not local Workspaces.
  if (isPickerEntry(declared)) {
    return pickerSources(
      ctx as unknown as { proton: { entryFace(entry: unknown, sources?: EntryKitSources): unknown } },
      {
        translate,
        ...(workspaces === undefined ? {} : { baseHook: selectorHook(workspaces.list) as never }),
      },
      extrasOf,
    )
  }

  const base = workspaces === undefined ? undefined : selectorHook(workspaces.list)
  return {
    // Drawing ourselves is what makes the hidden-Session filter possible: the
    // renderer hands the seat its whole standard kit as owner props, and those
    // are spread after the kit, so a kit-level override never wins.
    draw: (target, owner) => {
      const seat = owner as Record<string, unknown>
      const split = splitSeatProps(seat)
      const hidden = hiddenOf()
      let standard: Record<string, unknown> = base === undefined
        ? split.standard
        : { ...split.standard, useWorkspaces: base }
      if (hidden !== undefined) standard = tapListHooks(standard, hidden)
      return ctx.proton.entryFace(target, {
        translate,
        storeOf: candidate => storeSeat(candidate as RawEntry),
        standard,
        owner: split.owner,
      })
    },
  }
}

/**
 * Separate a seat's props into the standard kit and the seat-specific share.
 *
 * The slot renderer passes kit and owner props in one bag; only the seat share
 * may travel on as owner props (they are spread last, so a kit member left
 * here would override the kit the face assembled).
 * @param seat - the seat's combined props.
 * @returns the standard kit members and the remaining owner props.
 */
function splitSeatProps(seat: Record<string, unknown>): {
  standard: Record<string, unknown>
  owner: Record<string, unknown>
} {
  const standard: Record<string, unknown> = {}
  const owner: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(seat)) {
    const kit = /^use[A-Z]/u.test(key)
      || key === 'renderFactorySlot' || key === 'renderSlot' || key === 'renderSlotChain'
      || key === 'useStore' || key === 'actions' || key === 't'
    if (kit) standard[key] = value
    else owner[key] = value
  }
  return { standard, owner }
}