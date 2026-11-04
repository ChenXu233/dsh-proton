import type { Context } from '@deepseek-ai/cordis'
import { RegionRegistry } from './region'
import { registerDirectoryFlowOutlets } from './native'

export * from './region'
export * from './original'
export { registerDirectoryFlowOutlets } from './native'

declare module '@deepseek-ai/cordis' {
  interface Context {
    proton: RegionRegistry
  }
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  const registry = new RegionRegistry()
  ctx.provide('proton', registry)
  ctx.effect(() => registerDirectoryFlowOutlets(ctx, registry), 'proton: native directory-flow outlets')
}
