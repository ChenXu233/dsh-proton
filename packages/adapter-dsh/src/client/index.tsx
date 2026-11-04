import type { Context } from '@deepseek-ai/cordis'
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from 'dsh-proton/client'

/**
 * The two official seats a directory-picker backend's client half fills. Their
 * owner contract is the shipped `open` / `busy` / `onPicked` / `onCancel` /
 * `onError` interaction; this adapter is the only package allowed to know it.
 */
export const DIRECTORY_FLOW_SLOTS = [
  'sidebar.workspaces.directoryFlow',
  'conversation.hero.workspace.directoryFlow',
] as const

/** Region a directory-flow decorator targets. */
export const DIRECTORY_FLOW_REGION = 'workspace.directoryFlow' as const

/** The shipped owner contract, re-exported so domains never import ui-workspace themselves. */
export type DirectoryFlowContext = DirectoryFlowOwnerProps

declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    'workspace.directoryFlow': { context: DirectoryFlowContext }
  }
}

export const inject = ['slots', 'proton'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.proton.connect(DIRECTORY_FLOW_SLOTS.map(slot => ({ slot, region: DIRECTORY_FLOW_REGION }))),
    'proton-adapter-dsh: directory-flow outlets',
  )
}