import { Component } from 'react'
import type { ReactNode } from 'react'

/**
 * Catches one section's render failure so the rest of the list survives.
 *
 * A hidden failure looks exactly like a section that was never registered, and
 * that ambiguity has cost real debugging time before: say it in the DOM.
 */
export class SectionBoundary extends Component<{ label: string; children: ReactNode }, { message: string | null }> {
  override state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown): void {
    console.error(`[proton-workspace] section "${this.props.label}" failed:`, error)
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <div data-section-error={this.state.message} style={{ padding: '4px 8px', fontSize: 12, color: 'var(--dsw-alias-state-warning-primary, #d97706)' }}>
          {this.state.message}
        </div>
      )
    }
    return this.props.children
  }
}
