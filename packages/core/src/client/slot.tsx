import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { OriginalSlotEntry } from './original'
import { RegionHost } from './region'
import type { RegionContext, RegionName } from './index'
import type { RegionRegistry } from './region'

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
): () => void {
  const slots = ctx.slots as unknown as RawSlots
  const cleanups = outlets.map(({ slot, region, priority = -100, children }) => slots.inject(slot, () => {
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
    const sync = (): void => {      const occupied = registry.snapshot(region).occupied
      // An occupant can only shadow something that exists: registering before the
      // shipped entry does would take the single seat and leave that entry unable
      // to register at all, so the outlet would have no original to render.
      const shipped = slots.entriesOfSlot(slot).some(entry => entry.component !== undefined)
      if (occupied && dispose === undefined && shipped) {
        const Outlet = (owner: Record<string, unknown>): ReactNode => {
          useSyncExternalStore(
            listener => slots.subscribe(slot, listener),
            () => slots.getVersion(slot),
            () => slots.getVersion(slot),
          )
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
          return (
            <RegionHost
              registry={registry}
              name={region}
              context={owner as unknown as RegionContext<K>}
              fallback={original === undefined ? undefined : <OriginalSlotEntry entry={original} owner={owner} />}
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