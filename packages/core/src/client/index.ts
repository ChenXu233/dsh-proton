import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { RegionRegistry } from './region'
import { connectSlots } from './slot'
import type { SlotOutlet } from './slot'
import { EntryFace } from './entry'
import { OriginalSlotEntry } from './original'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { EntryKitSources } from './entry'

export * from './region'
export * from './original'
export * from './slot'
export * from './entry'

/**
 * Region vocabulary. Empty here on purpose: core knows nothing about workspaces,
 * sessions, or any other product domain. A domain package declares its regions by
 * merging into this interface from its own client entry — the same pattern DSH
 * uses for its own SlotMap.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ProtonRegionMap {}

export type RegionName = keyof ProtonRegionMap & string
export type RegionContext<K extends RegionName> = ProtonRegionMap[K] extends { context: infer C } ? C : never
export type RendererProps<K extends RegionName> = { context: RegionContext<K> }
export type ContributionProps<K extends RegionName> = RendererProps<K>
export type DecoratorProps<K extends RegionName> = RendererProps<K> & { next: () => ReactNode }

/** `ctx.proton`: the composition registry plus the outlet wiring that needs `ctx.slots`. */
export class ProtonRegistry extends RegionRegistry {
  constructor(private readonly host: Context) {
    super()
  }

  /** Wrap the official winners of `outlets` while their regions have content. */
  connect<K extends RegionName>(outlets: readonly SlotOutlet<K>[]): () => void {
    return connectSlots(this.host, this, outlets)
  }

  /**
   * Render one stored slot entry the way the host renderer would.
   *
   * Exposed as a service method rather than an import: this package's client
   * half ships as a browser bundle, so another package cannot import it at build
   * time — it can only call the service at runtime.
   * @param entry - the entry to render.
   * @param sources - standard props, translator, and store resolver.
   * @returns the rendered node.
   */
  entryFace(entry: StoredEntry, sources: EntryKitSources = {}): ReactNode {
    return EntryFace({ ctx: this.host, entry, sources })
  }

  /**
   * Register a source of kit props for entries a domain understands.
   *
   * The first provider that claims an entry draws it; one that returns undefined
   * passes. With no provider, the shipped plain-shape renderer still applies, so
   * a composition that contributes nothing behaves exactly as before.
   * @param provider - claims an entry and returns its kit sources.
   * @returns disposer.
   */
  addEntrySources(provider: (entry: StoredEntry) => EntryKitSources | undefined): () => void {
    this.entryProviders.push(provider)
    return () => {
      const index = this.entryProviders.indexOf(provider)
      if (index >= 0) this.entryProviders.splice(index, 1)
    }
  }

  /**
   * Draw a shadowed occupant: through a claiming provider's kit when there is
   * one, otherwise through the plain-shape renderer that fails loudly on shapes
   * it cannot support.
   * @param entry - the shadowed entry.
   * @param owner - owner props from the seat.
   * @returns the rendered node.
   */
  renderEntry(entry: StoredEntry, owner: Record<string, unknown>): ReactNode {
    for (const provider of this.entryProviders) {
      const sources = provider(entry)
      if (sources !== undefined) return this.entryFace(entry, { ...sources, owner })
    }
    return OriginalSlotEntry({ entry, owner })
  }

  /** Domains that know how to draw a particular entry. */
  private readonly entryProviders: Array<(entry: StoredEntry) => EntryKitSources | undefined> = []
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Generic composition registry: knows regions and entries, nothing about their meaning. */
    proton: ProtonRegistry
  }
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.provide('proton', new ProtonRegistry(ctx))
}
