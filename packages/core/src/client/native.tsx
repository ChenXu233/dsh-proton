import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { OriginalSlotEntry } from './original'
import { RegionHost } from './region'
import type { RegionRegistry } from './region'

const DIRECTORY_FLOWS = [
  'sidebar.workspaces.directoryFlow',
  'conversation.hero.workspace.directoryFlow',
] as const

/** Mount Proton around the original winner; disposal restores the official occupant. */
export function registerDirectoryFlowOutlets(ctx: Context, registry: RegionRegistry): () => void {
  const cleanups = DIRECTORY_FLOWS.map(name => ctx.slots.inject(name, () => {
    const seen = new WeakSet<StoredEntry>()
    const eligible = new WeakSet<StoredEntry>()
    const retired = new WeakSet<StoredEntry>()
    for (const entry of ctx.slots.entries(name)) seen.add(entry)
    const initialWinner = ctx.slots.entriesOfSlot(name)[0]
    if (initialWinner !== undefined) eligible.add(initialWinner)
    const stopError = ctx.slots.onEntryError((key, registration, _error, info) => {
      if (key === name && info.abdicated && 'options' in registration) retired.add(registration)
    })
    let dispose: (() => void) | undefined
    const sync = (): void => {
      const occupied = registry.snapshot('workspace.directoryFlow').occupied
      if (occupied && dispose === undefined) {
        const Outlet = (owner: DirectoryFlowOwnerProps): ReactNode => {
          useSyncExternalStore(
            listener => ctx.slots.subscribe(name, listener),
            () => ctx.slots.getVersion(name),
            () => ctx.slots.getVersion(name),
          )
          let original: StoredEntry | undefined
          for (const entry of ctx.slots.entries(name)) {
            if (entry.component === Outlet) continue
            if (!seen.has(entry)) {
              seen.add(entry)
              eligible.add(entry)
            }
            if (eligible.has(entry) && !retired.has(entry)) {
              original = entry
              break
            }
          }
          return (
            <RegionHost
              registry={registry}
              name="workspace.directoryFlow"
              context={owner}
              fallback={original === undefined ? null : <OriginalSlotEntry entry={original} owner={owner} />}
            />
          )
        }
        dispose = ctx.slots.register({ name, priority: -100 }, Outlet)
      } else if (!occupied && dispose !== undefined) {
        dispose()
        dispose = undefined
      }
    }
    sync()
    const unsubscribe = registry.subscribe(sync)
    return () => { unsubscribe(); stopError(); dispose?.() }
  }))
  return () => { for (const cleanup of cleanups) cleanup() }
}
