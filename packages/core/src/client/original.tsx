import type { ComponentType, ReactNode } from 'react'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'

const injectCache = new WeakMap<StoredEntry, Record<string, unknown>>()
const entryKeys = new WeakMap<StoredEntry, number>()
let nextEntryKey = 0

function entryKeyOf(entry: StoredEntry): number {
  let key = entryKeys.get(entry)
  if (key === undefined) {
    key = nextEntryKey++
    entryKeys.set(entry, key)
  }
  return key
}

function unsupported(entry: StoredEntry, feature: string): never {
  throw new Error(`Proton 暂不支持原 slot entry 的 ${feature}：${entry.registrant ?? 'unknown registrant'}`)
}

/** Render the original directory-flow occupant without cloning its registration or lifecycle. */
export function OriginalSlotEntry({ entry, owner }: { entry: StoredEntry; owner: object }): ReactNode {
  if (entry.children !== undefined) unsupported(entry, 'children')
  if (entry.store !== undefined) unsupported(entry, 'store')
  if (entry.locale !== undefined) unsupported(entry, 'locale')
  let injected = injectCache.get(entry)
  if (injected === undefined) {
    const inject = entry.inject
    injected = inject === undefined ? {} : inject()
    injectCache.set(entry, injected)
  }
  if ('hooks' in injected) unsupported(entry, 'hooks')
  if ('keyedHooks' in injected) unsupported(entry, 'keyedHooks')
  const Component = entry.component as ComponentType<Record<string, unknown>>
  return <Component key={entryKeyOf(entry)} {...injected} {...owner} />
}
