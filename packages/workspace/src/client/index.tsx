import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-proton/client'
import type { DirectoryFlowContext } from 'dsh-proton-adapter-dsh/client'
import { WorkspaceFlow } from './Flow'
import { WorkspaceSources } from './sources'

export * from './sources'
export { WorkspaceFlow } from './Flow'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Registration point for workspace backends. Domain-local on purpose: core knows nothing about workspaces. */
    protonWorkspace: WorkspaceSources
  }
}

/**
 * Region key owned by the adapter. Spelled out rather than imported so the two
 * client bundles stay independent; a test pins it against the adapter's export.
 */
export const DIRECTORY_FLOW_REGION = 'workspace.directoryFlow' as const

export const inject = ['slots', 'proton'] as const

export function apply(ctx: Context): void {
  const sources = new WorkspaceSources()
  ctx.provide('protonWorkspace', sources)
  ctx.effect(
    () => ctx.proton.registerDecorator(DIRECTORY_FLOW_REGION, { id: 'proton.workspace', order: 0 }, props => (
      <WorkspaceFlow context={props.context} sources={sources} next={props.next} />
    )),
    'proton-workspace: directory-flow decorator',
  )
}