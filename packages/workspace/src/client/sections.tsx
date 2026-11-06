import type { ReactNode } from 'react'

/**
 * One contribution to the workspace list.
 *
 * Sections are entries of the region the proton adapter opened in the sidebar:
 * the shipped browser is the region's fallback, every section renders after it,
 * and a section only owns what it draws. It is never handed the shipped list,
 * so it cannot replace, wrap, or re-render it.
 */
export interface WorkspaceSection {
  /** Stable identity within one composition; duplicates are rejected by the region. */
  readonly id: string
  /** Position after the shipped list; ties keep registration order. */
  readonly order?: number
  /** Heading drawn by the section itself, when it wants one. */
  readonly title?: string
  /**
   * Draw the section. The argument is the owner props the sidebar seat passed
   * down (the same props the shipped browser receives), so a section can use the
   * locale seat or the slot renderer without importing either package's types.
   */
  render(context: Record<string, unknown>): ReactNode
}
