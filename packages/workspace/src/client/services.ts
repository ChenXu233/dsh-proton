/**
 * What the workspace domain offers its own consumers.
 *
 * Kept apart from the client entry on purpose: this module must stay free of
 * the official UI packages so a consumer can import the contract without also
 * pulling their slot declarations into its type program.
 */
import type {} from '@deepseek-ai/cordis'
import type { PickerExtras } from './picker'
import type { WorkspaceSection } from './sections'
import type { WorkspaceSources } from './sources'

/**
 * Local Sessions the list must not draw.
 *
 * The remote conversation page borrows a local blank Session as the shell for
 * its composer; that Session is not a conversation on this machine and would
 * otherwise appear under whichever local Workspace owns its directory. The page
 * publishes it here while it owns the screen.
 */
export interface HiddenSessionSource {
  getSnapshot(): readonly string[]
  subscribe(listener: () => void): () => void
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
  /**
   * Hide local Sessions from the workspace list.
   *
   * One source per composition: the page that owns the screen is one, and two
   * owners filtering the same list would make the visible set ambiguous.
   * @param source - ids to hide, observable.
   * @returns disposer.
   */
  hideSessions(source: HiddenSessionSource): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Registration point for workspace backends and list sections. Domain-local on purpose: core knows nothing about workspaces. */
    protonWorkspace: WorkspaceServices
  }
}
