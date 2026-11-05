import { createElement } from 'react'
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
  const kit: Record<string, unknown> = {
    ...sources.standard,
    ...injectedOf(entry),
    ...sources.owner,
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
  const kit = kitOf(ctx, entry, sources)
  const Component = entry.component as ComponentType<Record<string, unknown>>
  return createElement(Component, { key: keyOf(entry), ...kit })
}
