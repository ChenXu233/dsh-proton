import { Component, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

/**
 * Order of the shipped workspace list among contributions. A section may place
 * itself before it with a negative order, or claim the whole region with
 * {@link WorkspaceSection.replacesNative}.
 */
export const NATIVE_SECTION_ORDER = 0

/** One contribution to the workspace list. */
export interface WorkspaceSection {
  /** Stable identity within one composition; duplicates are rejected. */
  readonly id: string
  /** Position among contributions; ties keep registration order. */
  readonly order?: number
  /** Heading drawn by the host; omit for a section that draws its own chrome. */
  readonly title?: string
  /**
   * Claim the whole region: the shipped list is not rendered at all. Several
   * sections may claim it; they then render beside each other and the shipped
   * list stays out.
   */
  readonly replacesNative?: boolean
  render(): ReactNode
}

/** One row the host knows how to draw: a contribution plus its resolved slot. */
interface Placement {
  key: string
  order: number
  /** Registration index, so equal orders keep arrival order. */
  index: number
  title: string | undefined
  /** Deferred on purpose: the boundary must be the thing that calls it. */
  body: () => ReactNode
}

/** Registry of contributions; the host observes it. */
export class SectionRegistry {
  private readonly entries = new Map<string, WorkspaceSection>()
  private readonly listeners = new Set<() => void>()
  private version = 0

  readonly getVersion = (): number => this.version

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /** Register one contribution; rejects a duplicate id and returns an idempotent disposer. */
  add(section: WorkspaceSection): () => void {
    if (this.entries.has(section.id)) throw new Error(`workspace section "${section.id}" is already registered`)
    this.entries.set(section.id, section)
    this.changed()
    let active = true
    return () => {
      if (!active) return
      active = false
      this.entries.delete(section.id)
      this.changed()
    }
  }

  list(): readonly WorkspaceSection[] {
    return [...this.entries.values()]
  }
}

/**
 * Calls one contribution's render inside the boundary that guards it. The host
 * must not call render itself: an eager call would throw above the boundary and
 * take the entire list with it.
 */
function SectionBody({ render }: { render: () => ReactNode }): ReactNode {
  return render()
}

/** Catches one section's render failure so the rest of the list survives. */
class SectionBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error(`[proton-workspace] section "${this.props.label}" failed:`, error)
  }

  override render(): ReactNode {
    if (this.state.failed) return null
    return this.props.children
  }
}

/**
 * Draw the workspace list: every contribution in order, the shipped list among
 * them unless a contribution claimed the region.
 * @param props.registry - registered contributions.
 * @param props.next - the shipped list, rendered where its order falls.
 * @returns the composed list.
 */
export function SectionsHost({ registry, next }: {
  registry: SectionRegistry
  /** The shipped list: a renderer, or ready content depending on the host. */
  next: ReactNode | (() => ReactNode)
}): ReactNode {
  const renderNative = typeof next === 'function' ? next : () => next
  useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion)
  const sections = registry.list()
  const nativeClaimed = sections.some(section => section.replacesNative === true)

  const placements: Placement[] = sections.map((section, index) => ({
    key: 'section:' + section.id,
    order: section.order ?? NATIVE_SECTION_ORDER,
    index,
    title: section.title,
    body: () => section.render(),
  }))
  if (!nativeClaimed) {
    placements.push({ key: 'section:@native', order: NATIVE_SECTION_ORDER, index: -1, title: undefined, body: renderNative })
  }
  placements.sort((left, right) => left.order - right.order || left.index - right.index)

  return (
    <>
      {placements.map((placement) => (
        <SectionBoundary key={placement.key} label={placement.key}>
          {placement.title === undefined ? null : <div data-proton-section-title="">{placement.title}</div>}
          <SectionBody render={placement.body} />
        </SectionBoundary>
      ))}
    </>
  )
}