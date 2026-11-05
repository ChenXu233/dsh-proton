import { createElement, useMemo, useRef, useSyncExternalStore } from 'react'
import { standardHookPropName } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComponentType, ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * What one rendered entry needs beyond its own registration.
 *
 * The host synthesizes this inside its renderer: standard props from the scope,
 * a `t` seat from the declared locale namespace, a store binding, and a
 * `renderSlot` face for declared children. None of that is reachable from
 * outside that renderer, so a takeover has to assemble the same kit here — and
 * only the caller knows where its own standard props come from.
 */
export interface EntryKitSources {
  /**
   * Standard props for the entry's scope: the hooks a domain contributes to the
   * root (useWorkspaces, useSessions, ...). Whatever is absent simply is not
   * passed — an entry that needs it fails loudly on its own terms.
   */
  standard?: Record<string, unknown>
  /**
   * Build the `t` seat for a declared locale namespace. The host reads it from
   * its locale face; a caller supplies a translator for the same namespace.
   */
  translate?: (namespace: string) => unknown
  /**
   * Resolve the entry's declared store into the two props the host would bind:
   * `useStore` and `actions`.
   */
  storeOf?: (entry: StoredEntry) => { useStore: unknown, actions: unknown } | undefined
  /**
   * Draw the entry outright instead of assembling the host's kit for it. Providers
   * use this when the shipped component cannot be driven through kit props alone.
   */
  draw?: (entry: StoredEntry, owner: Record<string, unknown>) => ReactNode
  /** Owner props from whoever renders the slot. */
  owner?: Record<string, unknown>
}

/** One renderable child of an entry, as the host's props face receives it. */
export interface ChildSlotOptions {
  entryKey?: string
  only?: string
  fallback?: ReactNode
  /** Opaque occurrence context for slot-declared hooks (row menus bind through it). */
  hookContext?: unknown
}

/** One observable source the host would expose as a hook prop. */
interface ObservableLike<T = unknown> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/**
 * Turn an observable source into the selector hook the shipped component expects
 * (`hooks: { hostInfo }` arrives as the `useHostInfo` prop).
 * @param source - observable with snapshot + subscribe.
 * @returns a selector hook.
 */
function selectorHook(source: ObservableLike) {
  return function useSelected<T>(selector: (snapshot: never) => T): T {
    // Selecting on every read returns a fresh object for object snapshots, which
    // React treats as a changing store and can escalate into an update loop.
    const cache = useRef<{ raw: unknown, selected: T } | undefined>(undefined)
    const read = (): T => {
      const raw = source.getSnapshot()
      const held = cache.current
      if (held !== undefined && held.raw === raw) return held.selected
      const selected = selector(raw as never)
      // A source that rebuilds its snapshot per read makes every selection a new
      // value, which React reads as a changing store and answers with an update
      // loop. Keeping the previous selection when it is shallow-equal breaks that.
      if (held !== undefined && shallowEqual(held.selected, selected)) {
        cache.current = { raw, selected: held.selected }
        return held.selected
      }
      cache.current = { raw, selected }
      return selected
    }
    return useSyncExternalStore(listener => source.subscribe(listener), read, read)
  }
}

/**
 * One-level structural comparison, enough to stop a rebuilt snapshot from being
 * mistaken for a state change.
 * @param left - previous value.
 * @param right - candidate value.
 * @returns true when both are the same shape with the same leaves.
 */
function shallowEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!(key in b)) return false
    if (a[key] !== b[key]) return false
  }
  return true
}

/** How deep child slots may nest before this face gives up. */
const MAX_DEPTH = 8

const injectCache = new WeakMap<StoredEntry, Record<string, unknown>>()
const entryKeys = new WeakMap<StoredEntry, number>()
let nextEntryKey = 0

/**
 * Stable React key per entry: a re-registration of the same component must
 * remount, an unchanged entry must not.
 * @param entry - the stored entry.
 * @returns a stable number.
 */
function keyOf(entry: StoredEntry): number {
  let key = entryKeys.get(entry)
  if (key === undefined) {
    key = nextEntryKey++
    entryKeys.set(entry, key)
  }
  return key
}

/**
 * The entry's own business face. The host calls it once per entry and keeps the
 * result; calling it every render restarts whatever flow it builds.
 * @param entry - the stored entry.
 * @returns injected props.
 */
function injectedOf(entry: StoredEntry): Record<string, unknown> {
  const cached = injectCache.get(entry)
  if (cached !== undefined) return cached
  const inject = entry.inject
  const injected = inject === undefined ? {} : (inject as () => Record<string, unknown>)()
  injectCache.set(entry, injected)
  return injected
}

/**
 * Build the props a child slot's winners receive.
 * @param ctx - client root context.
 * @param sources - kit sources inherited from the parent.
 * @param depth - current nesting depth.
 * @returns a `renderSlot`-shaped function.
 */
function createSlotFace(
  ctx: Context,
  sources: EntryKitSources,
  depth: number,
): (key: string, options?: ChildSlotOptions) => ReactNode {
  return (key, options = {}) => {
    if (depth >= MAX_DEPTH) {
      throw new Error(`Proton entry face: child slots nested deeper than ${MAX_DEPTH} at "${key}"`)
    }
    const slots = ctx.slots as unknown as {
      entriesOfSlot(slot: string): readonly StoredEntry[]
    }
    const winners = slots.entriesOfSlot(key)
    if (winners.length === 0) return options.fallback ?? null
    const rendered: ReactNode[] = []
    for (const child of winners) {
      if (options.only !== undefined && child.options?.id !== options.only) continue
      rendered.push(createElement(
        child.component as ComponentType<Record<string, unknown>>,
        { key: keyOf(child), ...kitOf(ctx, child, sources, depth + 1) },
      ))
    }
    return rendered.length === 0 ? (options.fallback ?? null) : rendered
  }
}

/**
 * Assemble the props the host would hand this entry.
 * @param ctx - client root context, for the child-slot face.
 * @param entry - the stored entry.
 * @param sources - the pieces only the caller can supply.
 * @param depth - current nesting depth, to bound the recursion.
 * @returns props for the entry component.
 */
export function kitOf(
  ctx: Context,
  entry: StoredEntry,
  sources: EntryKitSources = {},
  depth = 0,
): Record<string, unknown> {
  const injected = injectedOf(entry)
  const kit: Record<string, unknown> = {
    ...sources.standard,
    ...injected,
    ...sources.owner,
  }
  // Declared hook sources are not props: the host synthesizes one `use<Name>`
  // selector hook per source and passes that. Handing over the raw table leaves
  // the component calling `undefined`.
  const hooks = injected['hooks'] as Record<string, ObservableLike> | undefined
  const freezeHooks = (globalThis as unknown as { __freezeHooks?: boolean }).__freezeHooks === true
  if (hooks !== undefined) {
    for (const [name, source] of Object.entries(hooks)) {
      kit[standardHookPropName(name)] = freezeHooks
        ? (selector: (snapshot: never) => unknown) => selector(source.getSnapshot() as never)
        : selectorHook(source)
    }
  }
  const keyedHooks = injected['keyedHooks'] as Record<string, (key: string, member?: string) => ObservableLike | undefined> | undefined
  if (keyedHooks !== undefined) {
    for (const [name, source] of Object.entries(keyedHooks)) {
      kit[standardHookPropName(name)] = (key: string, member?: string) => {
        const found = source(key, member)
        return found === undefined ? undefined : selectorHook(found)
      }
    }
  }
  if (entry.locale !== undefined) {
    const translate = sources.translate
    if (translate === undefined) {
      throw new Error(`Proton entry face: entry declares locale namespace "${entry.locale}" but no translator was supplied (${entry.registrant ?? 'unknown registrant'})`)
    }
    kit['t'] = translate(entry.locale)
  }
  if (entry.store !== undefined) {
    const bound = sources.storeOf?.(entry)
    if (bound === undefined) {
      throw new Error(`Proton entry face: entry declares a store but no store resolver was supplied (${entry.registrant ?? 'unknown registrant'})`)
    }
    kit['useStore'] = bound.useStore
    kit['actions'] = bound.actions
  }
  if (entry.children !== undefined) {
    kit['renderSlot'] = createSlotFace(ctx, sources, depth)
  }
  return kit
}

/**
 * Render one stored entry the way the host renderer would.
 *
 * This is the takeover seam for rich entries: an outlet can shadow a shipped
 * occupant and still draw it, as long as the caller supplies the kit sources the
 * renderer would have synthesized (standard props, translator, store resolver).
 * A missing source fails loudly here rather than rendering half a widget.
 */
export function EntryFace({ ctx, entry, sources }: {
  ctx: Context
  entry: StoredEntry
  sources?: EntryKitSources
}): ReactNode {
  // The kit carries function-valued props (t, renderSlot, hooks). Rebuilding them
  // per render hands the component new dependencies every frame, which React turns
  // into a render loop.
  const g = globalThis as unknown as Record<string, number>
  g.__faceRenders = (g.__faceRenders ?? 0) + 1
  // Keyed by entry, not by the sources object: callers build that object per call,
  // and a kit rebuilt on every render hands the component fresh function props,
  // which its effects treat as a change and answer with another render.
  const latest = useRef(sources)
  latest.current = sources
  const kit = useMemo(() => kitOf(ctx, entry, latest.current), [ctx, entry])
  const Component = entry.component as ComponentType<Record<string, unknown>>
  return createElement(Component, { key: keyOf(entry), ...kit })
}
