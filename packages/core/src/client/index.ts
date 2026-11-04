import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { RegionRegistry } from './region'
import { connectSlots } from './slot'
import type { SlotOutlet } from './slot'

export * from './region'
export * from './original'
export * from './slot'

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
