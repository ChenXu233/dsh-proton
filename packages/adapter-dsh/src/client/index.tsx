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

/**
 * The seat holding the whole workspace list. A domain that takes it can render
 * its own sections beside the shipped one, or replace it outright — the region
 * is the workspace domain's home, the directory flow above is only one child
 * of the UI it inherits.
 */
export const WORKSPACES_SLOT = 'sidebar.workspaces' as const

/** Region a workspace-list decorator targets. */
export const WORKSPACES_REGION = 'workspace.list' as const

/**
 * Child slots the shipped workspace list declares along with its own
 * registration. An outlet shadows that registration, so it inherits the whole
 * contract — the directory flow below the list must keep existing even when
 * nothing but our own sections render the region.
 */
export const WORKSPACES_CHILDREN = {
  'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
} as const

/** The shipped owner contract, re-exported so domains never import ui-workspace themselves. */
export type DirectoryFlowContext = DirectoryFlowOwnerProps

declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    'workspace.directoryFlow': { context: DirectoryFlowContext }
    /** Owner props the shipped list passes down; opaque to this adapter. */
    'workspace.list': { context: Record<string, unknown> }
  }
}

export const inject = ['slots', 'proton'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.proton.connect([
      ...DIRECTORY_FLOW_SLOTS.map(slot => ({ slot, region: DIRECTORY_FLOW_REGION })),
      // PARKED: the outlet takes this seat only once the shipped list is visible to
      // it, and in this composition that never happens — `entries`/`entriesOfSlot`
      // both stay empty for the seat while the shipped list renders. Until that is
      // understood, taking the seat would blank the list. The entry face that can
      // draw the shipped occupant is in place (ctx.proton.renderEntry).
      // { slot: WORKSPACES_SLOT, region: WORKSPACES_REGION, children: WORKSPACES_CHILDREN,
      //   render: (entry, owner) => ctx.proton.renderEntry(entry, owner) },
    ]),
    'proton-adapter-dsh: workspace outlets',
  )
}