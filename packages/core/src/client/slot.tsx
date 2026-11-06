import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { OriginalSlotEntry } from './original'
import { RegionContributions, RegionHost, useHasContributions } from './region'
import { SplitPane } from './split'
import type { SplitStore } from './split'
import type { RegionContext, RegionName } from './index'
import type { RegionRegistry } from './region'

/**
 * The shadowed occupant, drawn through a component body so an error boundary can
 * catch it: a JSX prop expression evaluates inside the outlet's own render, where
 * no boundary of ours can see it.
 */
function ShadowedEntry({ entry, owner, draw }: {
  entry: StoredEntry
  owner: Record<string, unknown>
  draw?: ((entry: StoredEntry, owner: Record<string, unknown>) => ReactNode) | undefined
}): ReactNode {
  return draw === undefined ? <OriginalSlotEntry entry={entry} owner={owner} /> : draw(entry, owner)
}

/** One official slot the outlet may occupy on behalf of a region. */
export interface SlotOutlet<K extends RegionName> {
  /** Official slot key (opaque to core; the caller's domain owns the meaning). */
  slot: string
  /** Region whose content decides whether the outlet registers at all. */
  region: K
  /** Shadowing priority; lower wins. Defaults to -100 so the outlet shadows the shipped occupant. */
  priority?: number
  /**
   * Child slots the shipped occupant declares along with its own registration.
   * An outlet shadows that occupant, so it has to inherit the same contract:
   * the children are declared here verbatim, still opaque to core.
   */
  children?: Record<string, unknown>
  /**
   * Draw the occupant this outlet shadowed. Omitted, the shipped entry is
   * rendered as-is — which only supports the plain directory-flow shape.
   * Provided, a caller that can assemble a richer kit (standard props, locale
   * seat, store binding) draws it through the entry face instead.
   */
  render?: (entry: StoredEntry, owner: Record<string, unknown>) => ReactNode
  /**
   * Take the seat even while its region has no renderer, decorator or
   * contribution. Omitted, the outlet only registers once the region is
   * occupied — the right default for a seat that exists to host sections.
   * A seat whose whole point is to re-render the same entry with a different
   * kit (no extra content) asks for the shadow directly instead.
   */
  alwaysShadow?: boolean
  /**
   * Split the seat: the shipped occupant keeps the main pane, region
   * contributions get a resizable bottom pane. Omitted, contributions stack
   * under the occupant in one scroll area.
   */
  split?: {
    defaultRatio?: number
    minPx?: number
    maxRatio?: number
  }
}

/** The dynamic slice of `ctx.slots` this module needs; keys are runtime strings here. */
interface RawSlots {
  inject(key: string, callback: () => () => void): () => void
  register(options: { name: string; priority?: number; children?: Record<string, unknown> }, component: unknown): () => void
  entries(key: string): readonly StoredEntry[]
  entriesOfSlot(key: string): readonly StoredEntry[]
  onEntryError(fn: (key: string, registration: unknown, error: unknown, info: { abdicated: boolean }) => void): () => void
  subscribe(key: string, fn: () => void): () => void
  getVersion(key: string): number
}

/**
 * Wrap official single-slot winners so a region can decorate them without
 * cloning their registration. The outlet only registers while its region has
 * content; when the last entry leaves, the shipped occupant renders again.
 */
export function connectSlots<K extends RegionName>(
  ctx: Context,
  registry: RegionRegistry,
  outlets: readonly SlotOutlet<K>[],
  splitStore?: SplitStore,
): () => void {
  const slots = ctx.slots as unknown as RawSlots
  const cleanups = outlets.map(({ slot, region, priority = -100, children, render, split, alwaysShadow = false }) => slots.inject(slot, () => {
    const seen = new WeakSet<StoredEntry>()
    const eligible = new WeakSet<StoredEntry>()
    const retired = new WeakSet<StoredEntry>()
    for (const entry of slots.entries(slot)) seen.add(entry)
    const initialWinner = slots.entriesOfSlot(slot)[0]
    if (initialWinner !== undefined) eligible.add(initialWinner)
    const stopError = slots.onEntryError((key, registration, _error, info) => {
      if (key === slot && info.abdicated && registration !== null && typeof registration === 'object' && 'options' in registration) {
        retired.add(registration as StoredEntry)
      }
    })
    let dispose: (() => void) | undefined
    const sync = (): void => {
      const occupied = alwaysShadow || registry.snapshot(region).occupied
      // An occupant can only shadow something that exists: registering before the
      // shipped entry does would take the single seat and leave that entry unable
      // to register at all, so the outlet would have no original to render.
      // Presence, not election: the shipped occupant exists as soon as it registers,
      // but `entriesOfSlot` is the winning-cell view and can lag or stay empty for a
      // slot whose cells are elected elsewhere. Taking the seat before that existence
      // is known is what leaves an outlet with nothing to draw.
      const shipped = slots.entries(slot).length > 0
      if (occupied && dispose === undefined && shipped) {
        const Outlet = (owner: Record<string, unknown>): ReactNode => {
          useSyncExternalStore(
            listener => slots.subscribe(slot, listener),
            () => slots.getVersion(slot),
            () => slots.getVersion(slot),
          )
          const hasContributions = useHasContributions(registry, region)
          let original: StoredEntry | undefined
          for (const entry of slots.entries(slot)) {
            if (entry.component === Outlet) continue
            if (!seen.has(entry)) {
              seen.add(entry)
              eligible.add(entry)
            }
            if (eligible.has(entry) && !retired.has(entry)) {
              original = entry
              break
            }
          }
          const shared = original === undefined
            ? undefined
            : <ShadowedEntry entry={original} owner={owner as Record<string, unknown>} draw={render} />
          if (split !== undefined && splitStore !== undefined && hasContributions && shared !== undefined) {
            return (
              <SplitPane
                store={splitStore}
                slot={slot}
                top={shared}
                bottom={<RegionContributions registry={registry} name={region} context={owner as unknown as RegionContext<K>} />}
                {...split}
              />
            )
          }
          return (
            <RegionHost
              registry={registry}
              name={region}
              context={owner as unknown as RegionContext<K>}
              fallback={shared}
            />
          )
        }
        try {
          dispose = slots.register(children === undefined ? { name: slot, priority } : { name: slot, priority, children }, Outlet)
        } catch (error) {
          // The seat may already carry the shipped occupant's child declarations.
          // Re-declaring them here is a conflict, and losing the whole outlet over
          // it would leave the region blank; shadow the seat without the children.          dispose = slots.register({ name: slot, priority }, Outlet)
        }
      } else if (!occupied && dispose !== undefined) {
        dispose()
        dispose = undefined
      }
    }
    sync()
    // Two things decide whether the outlet should exist: the region gaining
    // content, and the seat gaining an occupant worth shadowing. Watching only
    // the region leaves the outlet unregistered whenever the shipped entry
    // arrives after the decorator, which renders no shipped list at all.
    const unsubscribe = registry.subscribe(sync)
    const stopSlot = slots.subscribe(slot, sync)
    return () => {
      unsubscribe()
      stopSlot()
      stopError()
      dispose?.()
    }
  }))
  return () => { for (const cleanup of cleanups) cleanup() }
}