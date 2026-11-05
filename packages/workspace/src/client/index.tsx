import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-proton/client'
import type { DirectoryFlowContext } from 'dsh-proton-adapter-dsh/client'
import { WorkspaceFlow } from './Flow'
import { SectionRegistry, SectionsHost } from './sections'
import type { WorkspaceSection } from './sections'
import { WorkspaceSources } from './sources'
import { workspaceEntrySources } from './entrySources'

export * from './sources'
export { NATIVE_SECTION_ORDER, SectionRegistry, SectionsHost } from './sections'
export type { WorkspaceSection } from './sections'
export { WorkspaceFlow } from './Flow'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Registration point for workspace backends and list contributions. Domain-local on purpose: core knows nothing about workspaces. */
    protonWorkspace: WorkspaceServices
  }
}

/** What the workspace domain offers its own consumers. */
export interface WorkspaceServices extends WorkspaceSources {
  /**
   * Contribute a section to the workspace list. Contributions render in
   * `order` beside the shipped list; one that sets `replacesNative` takes the
   * region instead. The host draws the title row and isolates a failing section
   * so the rest of the list keeps rendering.
   */
  addSection(section: WorkspaceSection): () => void
}

/**
 * Region key owned by the adapter. Spelled out rather than imported so the two
 * client bundles stay independent; a test pins it against the adapter's export.
 */
export const DIRECTORY_FLOW_REGION = 'workspace.directoryFlow' as const

/**
 * Region of the whole workspace list. Same rule as above: duplicated, and
 * pinned by a test.
 */
export const WORKSPACE_LIST_REGION = 'workspace.list' as const

// The entry kit reads these services while drawing the shipped workspace entry;
// cordis refuses an undeclared service access at runtime.
export const inject = ['slots', 'proton', 'locale', 'workspaces'] as const

export function apply(ctx: Context): void {
  const sources = new WorkspaceSources()
  const sections = new SectionRegistry()
  const services: WorkspaceServices = Object.assign(sources, {
    addSection: (section: WorkspaceSection) => sections.add(section),
  })
  ctx.provide('protonWorkspace', services)
  // Draw the shipped workspace entry ourselves: its own renderer is the only thing
  // that knows the kit it needs, and taking the seat means that renderer is no
  // longer the one rendering it.
  ctx.effect(
    () => ctx.proton.addEntrySources(entry => workspaceEntrySources(ctx, entry)),
    'proton-workspace: entry sources',
  )
  ctx.effect(
    () => ctx.proton.registerDecorator(DIRECTORY_FLOW_REGION, { id: 'proton.workspace', order: 0 }, props => (
      <WorkspaceFlow context={props.context} sources={sources} next={props.next} />
    )),
    'proton-workspace: directory-flow decorator',
  )
  ctx.effect(
    () => ctx.proton.registerDecorator(WORKSPACE_LIST_REGION, { id: 'proton.workspace.list', order: 0 }, props => (
      <SectionsHost registry={sections} next={props.next} />
    )),
    'proton-workspace: list host',
  )
}

/** Re-exported for the region map augmentation of consumers. */
export type { DirectoryFlowContext }
