import { Fragment, useSyncExternalStore } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type {
  ContributionProps, DecoratorProps, ProtonRegionMap, RegionContext, RegionName, RendererProps,
} from './index'

type Entry<P> = { id: string; sequence: number; component: ComponentType<P> }
type RendererEntry = Entry<RendererProps<RegionName>> & { priority: number }
type OrderedEntry<P> = Entry<P> & { order: number }

type RegionRecord = {
  renderers: RendererEntry[]
  decorators: OrderedEntry<DecoratorProps<RegionName>>[]
  contributions: OrderedEntry<ContributionProps<RegionName>>[]
}

const emptyRecord = (): RegionRecord => ({ renderers: [], decorators: [], contributions: [] })
const byOrder = <T extends { order: number; sequence: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.order - b.order || a.sequence - b.sequence)

/** Generic composition registry: renderers, decorators and contributions per region. */
export class RegionRegistry {
  private records = new Map<RegionName, RegionRecord>()
  private listeners = new Set<() => void>()
  private version = 0
  private sequence = 0

  readonly getVersion = (): number => this.version

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  private record(name: RegionName): RegionRecord {
    const current = this.records.get(name)
    if (current !== undefined) return current
    const created = emptyRecord()
    this.records.set(name, created)
    return created
  }

  registerRenderer<K extends RegionName>(
    name: K,
    options: { id: string; priority?: number },
    component: ComponentType<RendererProps<K>>,
  ): () => void {
    const priority = options.priority ?? 0
    const record = this.record(name)
    if (record.renderers.some(entry => entry.priority === priority)) {
      throw new Error(`region "${name}" already has a renderer at priority ${priority}`)
    }
    const entry: RendererEntry = { id: options.id, priority, sequence: ++this.sequence, component: component as unknown as RendererEntry['component'] }
    record.renderers = [...record.renderers, entry].sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
    this.changed()
    let active = true
    return () => {
      if (!active) return
      active = false
      record.renderers = record.renderers.filter(candidate => candidate !== entry)
      this.changed()
    }
  }

  registerDecorator<K extends RegionName>(
    name: K,
    options: { id: string; order?: number },
    component: ComponentType<DecoratorProps<K>>,
  ): () => void {
    const record = this.record(name)
    const entry: OrderedEntry<DecoratorProps<RegionName>> = { id: options.id, order: options.order ?? 0, sequence: ++this.sequence, component: component as unknown as OrderedEntry<DecoratorProps<RegionName>>['component'] }
    record.decorators = byOrder([...record.decorators, entry])
    this.changed()
    let active = true
    return () => {
      if (!active) return
      active = false
      record.decorators = record.decorators.filter(candidate => candidate !== entry)
      this.changed()
    }
  }

  registerContribution<K extends RegionName>(
    name: K,
    options: { id: string; order?: number },
    component: ComponentType<ContributionProps<K>>,
  ): () => void {
    const record = this.record(name)
    const entry: OrderedEntry<ContributionProps<RegionName>> = { id: options.id, order: options.order ?? 0, sequence: ++this.sequence, component: component as unknown as OrderedEntry<ContributionProps<RegionName>>['component'] }
    record.contributions = byOrder([...record.contributions, entry])
    this.changed()
    let active = true
    return () => {
      if (!active) return
      active = false
      record.contributions = record.contributions.filter(candidate => candidate !== entry)
      this.changed()
    }
  }

  snapshot<K extends RegionName>(name: K): {
    renderer?: RendererEntry
    decorators: readonly OrderedEntry<DecoratorProps<RegionName>>[]
    contributions: readonly OrderedEntry<ContributionProps<RegionName>>[]
    occupied: boolean
  } {
    const record = this.record(name)
    return {
      ...(record.renderers[0] === undefined ? {} : { renderer: record.renderers[0] }),
      decorators: record.decorators,
      contributions: record.contributions,
      occupied: record.renderers.length + record.decorators.length + record.contributions.length > 0,
    }
  }
}

/** Render one region: contributions around a renderer (or fallback), wrapped by decorators. */
export function RegionHost<K extends RegionName>(props: {
  registry: RegionRegistry
  name: K
  context: RegionContext<K>
  fallback?: ReactNode
}): ReactNode {
  const { registry, name, context, fallback = null } = props
  useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion)
  const snapshot = registry.snapshot(name)
  const regionContext = context as unknown as RegionContext<RegionName>
  const Renderer = snapshot.renderer?.component
  let content: ReactNode = (
    <Fragment>
      {Renderer === undefined
        ? fallback
        : <Renderer context={regionContext} />}
      {snapshot.contributions.map(entry => {
        const Contribution = entry.component
        return <Contribution key={entry.id} context={regionContext} />
      })}
    </Fragment>
  )
  for (const entry of [...snapshot.decorators].reverse()) {
    const Decorator = entry.component
    const next = content
    content = <Decorator key={entry.id} context={regionContext} next={() => next} />
  }
  return content
}