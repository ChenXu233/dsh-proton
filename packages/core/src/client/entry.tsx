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
  storeOf?: (entry: StoredEntry, sessionId?: string | undefined) => { useStore: unknown, actions: unknown } | undefined
  /**
   * Wrap the assembled kit before the entry receives it (memoized with the kit).
   * A domain uses this to replace one kit member with its own delegating face —
   * e.g. a submit entry that first offers the action to other plugins and only
   * then calls the shipped behavior. `owner` is a live ref: the wrapper may be
   * long-lived, while the seat's owner props change every render.
   */
  kitTap?: (kit: Record<string, unknown>, entry: StoredEntry, owner: { current: Record<string, unknown> }) => Record<string, unknown>
  /**
   * Draw the entry outright instead of assembling the host's kit for it. Providers
   * use this when the shipped component cannot be driven through kit props alone.
   */
  draw?: (entry: StoredEntry, owner: Record<string, unknown>) => ReactNode
  /**
   * Session the seat is rendered for. The host passes it to a session-scoped
   * entry's inject factory (see `InjectParams`); a takeover has to pass the same
   * argument, or an entry whose inject resolves that session fails on undefined.
   */
  scope?: { sessionId?: string | undefined }
  /**
   * Occurrence context for slot hook factories: the value the host renderer
   * hands a declared `hooks` factory alongside the standard kit. A factory
   * bound without it sees undefined fields and its hook crashes on first use.
   */
  hookContext?: unknown
  /**
   * Slot key this entry belongs to. The host also applies the *slot's own*
   * declared inject to every entry of that cell (a chat node seat receives its
   * turn-data hooks that way); the key lets the face resolve it.
   */
  slot?: string
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
const hookCache = new WeakMap<ObservableLike, ReturnType<typeof selectorHook>>()

/**
 * The selector hook for a source, cached: the host memoizes these per source, and
 * a fresh hook identity on every render is treated as a changed dependency.
 * @param source - observable with snapshot + subscribe.
 * @returns a stable selector hook.
 */
function hookFor(source: ObservableLike) {
  const cached = hookCache.get(source)
  if (cached !== undefined) return cached
  const built = selectorHook(source)
  hookCache.set(source, built)
  return built
}

/** Stable absent source: a missing key keeps one hook identity instead of remounting. */
const ABSENT_SOURCE: ObservableLike = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
}

const identity = <T,>(value: T): T => value

/** Declared hook factory: the host calls it with the standard kit and the occurrence context. */
export type SlotHookFactory = (standard: Record<string, unknown>, hookContext: unknown) => unknown

/** Open-key source family: one key (and optional member) resolves to its observable. */
export type KeyedSource = (key: string, member?: string) => ObservableLike | undefined

/**
 * Resolve one keyed source the way the host renderer does.
 *
 * The host's keyed hook takes either `(key, member)` for a plain read or
 * `(key, selector?, equal?)` for a projected one; a wrapper that only ever
 * returns a hook (or only ever reads a member) hands the component the wrong
 * value and its selectors silently stop applying.
 * @param source - keyed resolver from the entry's declared keyed hooks.
 * @returns a selector hook over the resolved source.
 */
function keyedHookFor(source: KeyedSource) {
  return function useKeyed<T>(
    keyOrSelector: string,
    second?: string | ((value: unknown) => T) | ((left: unknown, right: unknown) => boolean),
  ): T | undefined {
    const member = typeof second === 'string' ? second : undefined
    const selector = typeof second === 'function'
      ? second as (value: unknown) => T
      : undefined
    const found = member === undefined ? source(keyOrSelector) : source(keyOrSelector, member)
    // Hook order must not depend on data: resolve the source, then use its
    // cached hook even when the key has no value yet.
    return hookFor(found ?? ABSENT_SOURCE)((selector ?? identity) as (snapshot: never) => T)
  }
}

function selectorHook(source: ObservableLike) {
  return function useSelector<T>(selector: (snapshot: never) => T): T {
    // The host binds one subscribe/getSnapshot pair per source and keeps it. A new
    // pair on every render resubscribes each frame, and a source that notifies on
    // subscribe turns that into an unbounded render loop.
    const subscribe = useMemo(() => (listener: () => void) => source.subscribe(listener), [])
    const holder = useRef<{ raw: unknown, selected: T } | undefined>(undefined)
    const selectorRef = useRef(selector)
    selectorRef.current = selector
    const getSnapshot = useMemo(() => (): T => {
      const raw = source.getSnapshot()
      const held = holder.current
      if (held !== undefined && held.raw === raw) return held.selected
      const selected = selectorRef.current(raw as never)
      if (held !== undefined && shallowEqual(held.selected, selected)) {
        holder.current = { raw, selected: held.selected }
        return held.selected
      }
      holder.current = { raw, selected }
      return selected
    }, [])
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
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

const injectCache = new WeakMap<StoredEntry, Map<string, Record<string, unknown>>>()
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
function injectedOf(
  entry: StoredEntry,
  bound: { actions?: unknown } | undefined,
  scope: { sessionId?: string | undefined } | undefined,
): Record<string, unknown> {
  let perEntry = injectCache.get(entry)
  if (perEntry === undefined) {
    perEntry = new Map()
    injectCache.set(entry, perEntry)
  }
  const key = (scope?.sessionId ?? '') + (bound === undefined ? '' : '\u0000store')
  const cached = perEntry.get(key)
  if (cached !== undefined) return cached
  const inject = entry.inject as ((...args: unknown[]) => Record<string, unknown>) | undefined
  let injected: Record<string, unknown>
  if (inject === undefined) injected = {}
  else if (scope === undefined) injected = inject()
  else if (entry.store !== undefined) injected = inject(scope.sessionId, bound?.actions)
  else injected = inject(scope.sessionId)
  perEntry.set(key, injected)
  return injected
}

/** Chain dispatch options: the owner fallback for the all-decline case. */
export interface ChildChainOptions {
  fallback?: ReactNode
  /** Render only the owner fallback without resolving the chain (composer overlay seats). */
  fallbackOnly?: boolean
  /** Keep the fallback mounted (hidden) instead of unmounting it when an entry is elected. */
  overlay?: boolean
}

/**
 * Render one child entry with the kit the host renderer would hand it.
 * @param ctx - client root context.
 * @param child - the stored registration.
 * @param sources - kit sources inherited from the parent.
 * @param depth - current nesting depth.
 * @param ownerRef - live owner props of the parent entry.
 * @param ownerProps - owner props this render site supplies.
 * @param hookContext - occurrence context for declared hook factories.
 * @returns the rendered child.
 */
function renderChild(
  ctx: Context,
  child: StoredEntry,
  slot: string,
  sources: EntryKitSources,
  depth: number,
  ownerRef: { current: Record<string, unknown> } | undefined,
  ownerProps: Record<string, unknown>,
  hookContext: unknown,
): ReactNode {
  // The seat's owner props carry the renderer's standard kit (the root
  // `use*` hooks every entry may need). Children rendered by the shipped
  // component expect the same kit, and a real renderer injects it; a face
  // must hand it down explicitly, from the live owner rather than the
  // memoized one.
  const childSources: EntryKitSources = {
    ...sources,
    slot,
    ...(hookContext === undefined ? {} : { hookContext }),
    ...(ownerRef === undefined ? {} : { owner: ownerRef.current }),
  }
  return createElement(
    child.component as ComponentType<Record<string, unknown>>,
    {
      key: keyOf(child),
      ...kitOf(ctx, child, childSources, depth + 1),
      ...ownerProps,
      ...(hookContext === undefined ? {} : { hookContext }),
    },
  )
}

/**
 * Build the props a child slot's winners receive.
 *
 * The host's own signature is `renderSlot(key, owner, opts)`: owner props and
 * dispatch options are separate arguments. Treating the second argument as the
 * options bag silently dropped `entryKey` (every keyed renderer mounted at
 * once) and the third argument entirely.
 * @param ctx - client root context.
 * @param sources - kit sources inherited from the parent.
 * @param depth - current nesting depth.
 * @returns a `renderSlot`-shaped function.
 */
function createSlotFace(
  ctx: Context,
  sources: EntryKitSources,
  depth: number,
  ownerRef?: { current: Record<string, unknown> },
): (key: string, owner?: Record<string, unknown>, options?: ChildSlotOptions) => ReactNode {
  return (key, owner = {}, options = {}) => {
    if (depth >= MAX_DEPTH) {
      throw new Error(`Proton entry face: child slots nested deeper than ${MAX_DEPTH} at "${key}"`)
    }
    const slots = ctx.slots as unknown as {
      entriesOfSlot(slot: string): readonly StoredEntry[]
    }
    const { entryKey, only, fallback, hookContext } = options
    const winners = slots.entriesOfSlot(key)
    if (winners.length === 0) return fallback ?? null
    // A keyed seat is dispatched by the caller's `entryKey`: rendering every
    // registered renderer for one row stacks all message kinds on top of each
    // other, and every one of them receives props for another kind's data.
    const keyed = winners.some(child => child.options?.key !== undefined)
    const rendered: ReactNode[] = []
    for (const child of winners) {
      if (keyed && (entryKey === undefined || child.options?.key !== entryKey)) continue
      if (only !== undefined && child.options?.id !== only) continue
      rendered.push(renderChild(ctx, child, key, sources, depth, ownerRef, owner, hookContext))
    }
    return rendered.length === 0 ? (fallback ?? null) : rendered
  }
}

/**
 * Build the props a chain child slot receives.
 *
 * Chain routing is a pure selector pass: entries are tried in priority order,
 * the first non-null `select(owner)` result is elected and receives `matched`,
 * and an all-decline chain renders the owner fallback.
 * @param ctx - client root context.
 * @param sources - kit sources inherited from the parent.
 * @param depth - current nesting depth.
 * @returns a `renderSlotChain`-shaped function.
 */
function createChainFace(
  ctx: Context,
  sources: EntryKitSources,
  depth: number,
  ownerRef?: { current: Record<string, unknown> },
): (key: string, owner?: Record<string, unknown>, options?: ChildChainOptions) => ReactNode {
  return (key, owner = {}, options = {}) => {
    if (depth >= MAX_DEPTH) {
      throw new Error(`Proton entry face: child slots nested deeper than ${MAX_DEPTH} at "${key}"`)
    }
    if (options.fallbackOnly === true) return options.fallback ?? null
    const slots = ctx.slots as unknown as {
      entries(slot: string): readonly StoredEntry[]
    }
    const entries = [...slots.entries(key)]
      .sort((left, right) => (left.options?.priority ?? 0) - (right.options?.priority ?? 0))
    let elected: ReactNode = null
    for (const entry of entries) {
      const select = (entry as unknown as { select?: (candidate: object) => unknown }).select
      if (select === undefined) continue
      let matched: unknown
      try {
        matched = select(owner)
      } catch {
        // A throwing selector is a registrant contract breach: decline, keep
        // the chain and its fallback intact rather than blacking out the seat.
        continue
      }
      if (matched === null) continue
      elected = renderChild(ctx, entry, key, sources, depth, ownerRef, { ...owner, matched }, undefined)
      break
    }
    return elected ?? (options.fallback ?? null)
  }
}

/**
 * One declared inject face, as the host consumes it: plain props, observable
 * hooks, and hooks declared as `(standard, hookContext) => hook` factories.
 */
interface InjectFace {
  hooks?: Record<string, ObservableLike | SlotHookFactory>
  keyedHooks?: Record<string, KeyedSource | undefined>
  [key: string]: unknown
}

/** Bound factory hooks, per occurrence context, so a re-render reuses them. */
const factoryHookCache = new WeakMap<object, WeakMap<object, Record<string, unknown>>>()

/**
 * Bind one inject face onto the props object.
 *
 * Declared hooks are not props: the host synthesizes one `use<Name>` selector
 * hook per observable source, calls a factory with the standard kit and the
 * occurrence context, and wraps a keyed family in the host's `(key, selector)`
 * call shape. Handing over the raw tables leaves components calling undefined.
 * @param kit - props being assembled (mutated).
 * @param face - the entry's or the cell's declared inject result.
 * @param standard - standard kit handed to factories.
 * @param hookContext - occurrence context handed to factories.
 */
function applyInjected(
  kit: Record<string, unknown>,
  face: InjectFace,
  standard: Record<string, unknown>,
  hookContext: unknown,
): void {
  const { hooks, keyedHooks, ...rest } = face
  Object.assign(kit, rest)
  if (hooks !== undefined) {
    const cached = factoryHooks(hooks, standard, hookContext)
    for (const [name, source] of Object.entries(hooks)) {
      kit[standardHookPropName(name)] = typeof source === 'function'
        ? cached?.[name] ?? source(standard, hookContext)
        : hookFor(source)
    }
  }
  if (keyedHooks !== undefined) {
    for (const [name, source] of Object.entries(keyedHooks)) {
      if (source !== undefined) kit[standardHookPropName(name)] = keyedHookFor(source)
    }
  }
}

/**
 * Factories rebuilt every render hand the component a fresh hook identity, so
 * memoized children re-render on every parent pass. Cache per hookContext
 * object; a context that is not an object simply gets fresh factories.
 * @param hooks - declared factories and observables.
 * @param standard - standard kit handed to factories.
 * @param hookContext - occurrence context.
 * @returns the bound factory props, when cacheable.
 */
function factoryHooks(
  hooks: Record<string, ObservableLike | SlotHookFactory>,
  standard: Record<string, unknown>,
  hookContext: unknown,
): Record<string, unknown> | undefined {
  if (hookContext === null || typeof hookContext !== 'object') return undefined
  let perContext = factoryHookCache.get(hookContext)
  if (perContext === undefined) {
    perContext = new WeakMap()
    factoryHookCache.set(hookContext, perContext)
  }
  const key = hooks as object
  const cached = perContext.get(key)
  if (cached !== undefined) return cached
  const bound: Record<string, unknown> = {}
  for (const [name, source] of Object.entries(hooks)) {
    if (typeof source === 'function') bound[name] = source(standard, hookContext)
  }
  perContext.set(key, bound)
  return bound
}

/** Resolve one slot's declared inject face, when it has one. */
function slotInjectOf(ctx: Context, slot: string): InjectFace | undefined {
  // `spec` is the registry's public lookup; `specOf` only exists on the
  // renderer's internal host face, which a takeover cannot reach.
  const slots = ctx.slots as unknown as {
    spec?(key: string): { inject?: unknown } | undefined
    specDynamic?(key: string): { inject?: unknown } | undefined
  }
  const declared = (slots.spec?.(slot) ?? slots.specDynamic?.(slot))?.inject
  if (declared === undefined) return undefined
  if (typeof declared === 'function') {
    return (declared as () => InjectFace)()
  }
  return declared as InjectFace
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
  ownerRef?: { current: Record<string, unknown> },
): Record<string, unknown> {
  const bound = entry.store === undefined ? undefined : sources.storeOf?.(entry, sources.scope?.sessionId)
  const standard = (sources.standard ?? {}) as Record<string, unknown>
  const kit: Record<string, unknown> = { ...standard }
  applyInjected(kit, injectedOf(entry, bound, sources.scope), standard, sources.hookContext)
  // The cell's own inject applies to every entry in it and wins over the
  // entry's (the host spreads it after): a chat node seat gets its turn-data
  // hooks from here, not from its registration.
  const cell = sources.slot === undefined ? undefined : slotInjectOf(ctx, sources.slot)
  if (cell !== undefined) applyInjected(kit, cell, standard, sources.hookContext)
  Object.assign(kit, sources.owner)
  if (entry.locale !== undefined) {
    const translate = sources.translate
    if (translate === undefined) {
      throw new Error(`Proton entry face: entry declares locale namespace "${entry.locale}" but no translator was supplied (${entry.registrant ?? 'unknown registrant'})`)
    }
    kit['t'] = translate(entry.locale)
  }
  if (entry.store !== undefined) {
    if (bound === undefined) {
      throw new Error(`Proton entry face: entry declares a store but no store resolver was supplied (${entry.registrant ?? 'unknown registrant'})`)
    }
    kit['useStore'] = bound.useStore
    kit['actions'] = bound.actions
  }
  if (entry.children !== undefined) {
    kit['renderSlot'] = createSlotFace(ctx, sources, depth, ownerRef)
    kit['renderSlotChain'] = createChainFace(ctx, sources, depth, ownerRef)
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
  // Keyed by entry, not by the sources object: callers build that object per call,
  // and a kit rebuilt on every render hands the component fresh function props,
  // which its effects treat as a change and answer with another render.
  const latest = useRef(sources)
  latest.current = sources
  const owner = latest.current?.owner ?? {}
  // Owner props are per-render data (a menu's `open`, the current selection, the
  // anchor ref): memoizing them would freeze the entry in the render that first
  // mounted it. Only the kit — translator, hooks, store binding, slot face — is
  // memoized, because rebuilding those per render hands the component new
  // function dependencies every frame.
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  // The session is part of the kit, not of the owner props: a different session
  // means a different inject face (keyboard, scope services) and a different
  // store instance, so the memo must follow it.
  const sessionId = latest.current?.scope?.sessionId
  const kit = useMemo(() => {
    const current = latest.current ?? {}
    const { owner: _owner, kitTap, ...rest } = current
    const assembled = kitOf(ctx, entry, rest, 0, ownerRef)
    return kitTap === undefined ? assembled : kitTap(assembled, entry, ownerRef)
  }, [ctx, entry, sessionId])
  const Component = entry.component as ComponentType<Record<string, unknown>>
  return createElement(Component, { key: keyOf(entry), ...kit, ...owner })
}