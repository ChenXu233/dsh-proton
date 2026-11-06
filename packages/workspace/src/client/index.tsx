import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-proton/client'
import type { DirectoryFlowContext } from 'dsh-proton-adapter-dsh/client'
import { WorkspaceFlow } from './Flow'
import { SectionBoundary } from './boundary'
import type { WorkspaceSection } from './sections'
import { WorkspaceSources } from './sources'
import { workspaceEntrySources } from './entrySources'
import type { PickerExtras } from './picker'

export * from './sources'
export type { WorkspaceSection } from './sections'
export type { PickerExtras, PickerRow } from './picker'
export { WorkspaceFlow } from './Flow'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Registration point for workspace backends and list sections. Domain-local on purpose: core knows nothing about workspaces. */
    protonWorkspace: WorkspaceServices
  }
}

declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    /** The hero workspace picker's seat: its contributions render beside the shipped menu. */
    'hero.workspace': { context: Record<string, unknown> }
  }
}

/** What the workspace domain offers its own consumers. */
export interface WorkspaceServices extends WorkspaceSources {
  /**
   * Contribute a section to the workspace list.
   *
   * The proton adapter holds the sidebar seat and renders the shipped browser as
   * the region fallback; a section is an entry of that region, so it renders
   * after the shipped list, owns only its own rows, and never receives the
   * shipped list to replace or wrap.
   */
  addSection(section: WorkspaceSection): () => void
  /**
   * Offer extra rows to the hero workspace picker.
   *
   * The shipped picker reads the real registry; this is the one seam that lets a
   * domain show workspaces it holds elsewhere. One source per composition: the
   * picker is a single-seat menu, and two owners merging into it would make the
   * selected row ambiguous.
   * @param extras - rows and the pick face that handles them.
   * @returns disposer.
   */
  addPickerExtras(extras: PickerExtras): () => void
}

/**
 * Region keys owned by the adapter. Spelled out rather than imported so the two
 * client bundles stay independent; a test pins them against the adapter exports.
 */
export const DIRECTORY_FLOW_REGION = 'workspace.directoryFlow' as const
export const WORKSPACE_LIST_REGION = 'workspace.list' as const
/** The shipped hero picker seat (the menu behind the workspace chip). */
export const HERO_PICKER_SLOT = 'conversation.hero.workspace' as const
/** Region the picker outlet shadows for this domain. */
export const HERO_PICKER_REGION = 'hero.workspace' as const

// The entry kit reads these services while drawing the shipped workspace entry;
// cordis refuses an undeclared service access at runtime.
export const inject = ['slots', 'proton', 'locale', 'workspaces'] as const

export function apply(ctx: Context): void {
  const sources = new WorkspaceSources()
  let pickerExtras: PickerExtras | undefined
  const services: WorkspaceServices = Object.assign(sources, {
    addSection: (section: WorkspaceSection) => ctx.proton.registerContribution(
      WORKSPACE_LIST_REGION,
      { id: section.id, order: section.order ?? 0 },
      ({ context }) => (
        <SectionBoundary label={section.id}>
          {section.title === undefined ? null : <div data-proton-section-title="">{section.title}</div>}
          {section.render(context as Record<string, unknown>)}
        </SectionBoundary>
      ),
    ),
    addPickerExtras: (extras: PickerExtras) => {
      pickerExtras = extras
      return () => {
        if (pickerExtras === extras) pickerExtras = undefined
      }
    },
  })
  ctx.provide('protonWorkspace', services)
  // Draw the shipped workspace entry ourselves: it is the region fallback, and
  // only the entry's own renderer knows the kit it needs.
  ctx.effect(
    () => ctx.proton.addEntrySources(entry => workspaceEntrySources(ctx, entry, () => pickerExtras)),
    'proton-workspace: entry sources',
  )
  // Take the hero picker seat for the same reason as the sidebar one: the
  // shipped menu has no section seam, so the domain that owns extra rows has to
  // hand it a kit. Nothing is added to the menu unless a source registered.
  ctx.effect(
    () => ctx.proton.connect([{
      slot: HERO_PICKER_SLOT,
      region: HERO_PICKER_REGION,
      // No contribution is required: the point is to draw the same entry with a
      // merged kit, so the outlet must take the seat even while the region is
      // empty (otherwise the shipped picker keeps the seat and no row appears).
      alwaysShadow: true,
      render: (entry, owner) => ctx.proton.renderEntry(entry, owner),
    }]),
    'proton-workspace: picker seat',
  )
  ctx.effect(
    () => ctx.proton.registerDecorator(DIRECTORY_FLOW_REGION, { id: 'proton.workspace', order: 0 }, props => (
      <WorkspaceFlow context={props.context} sources={sources} next={props.next} />
    )),
    'proton-workspace: directory-flow decorator',
  )
}

/** Re-exported for the region map augmentation of consumers. */
export type { DirectoryFlowContext }
