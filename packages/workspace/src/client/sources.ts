/** One selectable workspace offered by a source. Ids are source-local. */
export interface SourceCandidate {
  id: string
  title: string
  detail?: string
  status: 'online' | 'offline' | 'unknown'
}

/**
 * What a source can say about one directory it produced. A source that
 * materializes a stand-in directory (a mount point, a bookmark, an anchor for
 * a machine it reaches itself) knows where the real workspace lives; a source
 * that hands out real local paths simply has nothing to add.
 */
export interface SourceMark {
  /** Machine the directory actually lives on; absent when it is this machine. */
  readonly machine?: string
  /** Path on that machine; absent when the local directory is the real path. */
  readonly remotePath?: string
}

/**
 * A backend that can offer workspaces and turn one of them into a local
 * directory the shipped directory flow can adopt. The domain never learns how
 * the backend reaches its machines; SSH, an HTTP mesh, or a fixed list are all
 * the same shape here.
 */
export interface WorkspaceSource {
  /** Stable identity within one composition; duplicates are rejected. */
  readonly id: string
  /** Operator-facing name shown above this source's candidates. */
  readonly label: string
  list(): Promise<readonly SourceCandidate[]>
  /** Materialize one candidate as an absolute local directory path. */
  adopt(id: string): Promise<{ path: string }>
  /**
   * Recognize one directory this source produced and describe where the
   * workspace really lives. Synchronous on purpose: a browser row asks this
   * while rendering, so the answer comes from state the source already holds.
   */
  describe?(path: string): SourceMark | undefined
  /**
   * Report that {@link WorkspaceSource.describe} started answering differently
   * — the state behind a mark arrived, or a machine went away. Sources that
   * answer from a live remote snapshot must implement this, or the rows that
   * asked before the answer arrived have no reason to ask again.
   * @returns unsubscriber.
   */
  subscribe?(listener: () => void): () => void
}

/** One collected row, paired with the source that offered it. */
export interface CollectedCandidate {
  sourceId: string
  sourceLabel: string
  candidate: SourceCandidate
}

export interface CollectResult {
  rows: readonly CollectedCandidate[]
  failures: readonly { sourceId: string; message: string }[]
}

/** Registered sources, observed by the flow UI. */
export class WorkspaceSources {
  private readonly sources = new Map<string, WorkspaceSource>()
  private readonly listeners = new Set<() => void>()
  /** Per-source unsubscriber, so a departing source stops waking the ledger. */
  private readonly sourceListeners = new Map<string, () => void>()
  private readonly markListeners = new Set<() => void>()
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

  /** Register one backend; rejects a duplicate id and returns an idempotent disposer. */
  addSource(source: WorkspaceSource): () => void {
    if (this.sources.has(source.id)) throw new Error(`workspace source "${source.id}" is already registered`)
    this.sources.set(source.id, source)
    const off = source.subscribe?.(() => {
      for (const listener of [...this.markListeners]) listener()
    })
    if (off !== undefined) this.sourceListeners.set(source.id, off)
    this.changed()
    let active = true
    return () => {
      if (!active) return
      active = false
      this.sourceListeners.get(source.id)?.()
      this.sourceListeners.delete(source.id)
      this.sources.delete(source.id)
      this.changed()
    }
  }

  list(): readonly WorkspaceSource[] {
    return [...this.sources.values()]
  }

  /**
   * Watch every source's own knowledge changes, including sources registered
   * after this call. Batched on purpose: one notification per source event, no
   * per-path registry — the ledger says "ask again", not "this path changed".
   * @param listener - called whenever any source reports a change.
   * @returns unsubscriber.
   */
  onMarkChange(listener: () => void): () => void {
    this.markListeners.add(listener)
    return () => { this.markListeners.delete(listener) }
  }

  /**
   * The first source that recognizes `path`, with the mark it reports.
   * Registration order decides; two sources claiming one directory is a
   * composition bug rather than something to merge.
   */
  describe(path: string): (SourceMark & { sourceId: string; sourceLabel: string }) | undefined {
    for (const source of this.sources.values()) {
      const mark = source.describe?.(path)
      if (mark !== undefined) return { ...mark, sourceId: source.id, sourceLabel: source.label }
    }
    return undefined
  }

  /** Collect every source's candidates; one failing source never hides the others. */
  async collect(): Promise<CollectResult> {
    const results = await Promise.allSettled(this.list().map(async source => ({
      source,
      candidates: await source.list(),
    })))
    const rows: CollectedCandidate[] = []
    const failures: { sourceId: string; message: string }[] = []
    results.forEach((result, index) => {
      const source = this.list()[index]
      if (source === undefined) return
      if (result.status === 'fulfilled') {
        for (const candidate of result.value.candidates) {
          rows.push({ sourceId: source.id, sourceLabel: source.label, candidate })
        }
      } else {
        failures.push({
          sourceId: source.id,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    })
    return { rows, failures }
  }

  /** Adopt one candidate through the source that offered it. */
  async adopt(sourceId: string, id: string): Promise<{ path: string }> {
    const source = this.sources.get(sourceId)
    if (source === undefined) throw new Error(`unknown workspace source "${sourceId}"`)
    return await source.adopt(id)
  }
}
