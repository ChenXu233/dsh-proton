import { Fragment, useSyncExternalStore } from 'react'
import type { ComponentType, ReactNode } from 'react'

export interface ProtonWorkspace {
  workspaceId: string
  path: string
  title: string
}

export interface DirectoryFlowContext {
  open: boolean
  busy: boolean
  onPicked: (path: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

export interface ProtonRegionMap {
  'workspace.directoryFlow': { context: DirectoryFlowContext }
  'workspace.row': { context: { workspace: ProtonWorkspace } }
  'workspace.actions': { context: Record<string, never> }
}

export type RegionName = keyof ProtonRegionMap & string
export type RegionContext<K extends RegionName> = ProtonRegionMap[K]['context']
export type RendererProps<K extends RegionName> = { context: RegionContext<K> }
export type ContributionProps<K extends RegionName> = RendererProps<K>
export type DecoratorProps<K extends RegionName> = RendererProps<K> & { next: () => ReactNode }

type Entry<K extends RegionName, P> = {
  id: string
  sequence: number
  component: ComponentType<P>
}
type RendererEntry<K extends RegionName> = Entry<K, RendererProps<K>> & { priority: number }
type OrderedEntry<K extends RegionName, P> = Entry<K, P> & { order: number }

type RegionRecord = {
  renderers: RendererEntry<RegionName>[]
  decorators: OrderedEntry<RegionName, DecoratorProps<RegionName>>[]
  contributions: OrderedEntry<RegionName, ContributionProps<RegionName>>[]
}

const emptyRecord = (): RegionRecord => ({ renderers: [], decorators: [], contributions: [] })
const order = <T extends { order: number; sequence: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.order - b.order || a.sequence - b.sequence)

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
    const entry: RendererEntry<K> = { id: options.id, priority, sequence: ++this.sequence, component }
    record.renderers = [...record.renderers, entry as RendererEntry<RegionName>].sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
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
    const entry = { id: options.id, order: options.order ?? 0, sequence: ++this.sequence, component }
    record.decorators = order([...record.decorators, entry as OrderedEntry<RegionName, DecoratorProps<RegionName>>])
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
    const entry = { id: options.id, order: options.order ?? 0, sequence: ++this.sequence, component }
    record.contributions = order([...record.contributions, entry as OrderedEntry<RegionName, ContributionProps<RegionName>>])
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
    renderer?: RendererEntry<K>
    decorators: readonly OrderedEntry<K, DecoratorProps<K>>[]
    contributions: readonly OrderedEntry<K, ContributionProps<K>>[]
    occupied: boolean
  } {
    const record = this.record(name)
    return {
      ...(record.renderers[0] === undefined ? {} : { renderer: record.renderers[0] as RendererEntry<K> }),
      decorators: record.decorators as OrderedEntry<K, DecoratorProps<K>>[],
      contributions: record.contributions as OrderedEntry<K, ContributionProps<K>>[],
      occupied: record.renderers.length + record.decorators.length + record.contributions.length > 0,
    }
  }
}

export function RegionHost<K extends RegionName>(props: {
  registry: RegionRegistry
  name: K
  context: RegionContext<K>
  fallback?: ReactNode
}): ReactNode {
  const { registry, name, context, fallback = null } = props
  useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion)
  const snapshot = registry.snapshot(name)
  const Renderer = snapshot.renderer?.component
  let content: ReactNode = (
    <Fragment>
      {Renderer === undefined ? fallback : <Renderer context={context} />}
      {snapshot.contributions.map(entry => {
        const Contribution = entry.component
        return <Contribution key={entry.id} context={context} />
      })}
    </Fragment>
  )
  for (const entry of [...snapshot.decorators].reverse()) {
    const Decorator = entry.component
    const next = content
    content = <Decorator key={entry.id} context={context} next={() => next} />
  }
  return content
}
