import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { registerDirectoryFlowOutlets } from '../src/client/native'
import { RegionRegistry } from '../src/client/region'

it('renders the original winner beside Proton content and restores it on disposal', () => {
  const entries: StoredEntry[] = []
  const active = new Map<string, StoredEntry>()
  const listeners = new Set<() => void>()
  let version = 0
  const original = {
    component: ({ open, marker }: { open: boolean; marker: string }) => createElement(
      'span', null, `original:${marker}:${String(open)}`,
    ),
    inject: () => ({ marker: 'native' }),
  } as unknown as StoredEntry
  entries.push(original)
  const ctx = {
    slots: {
      inject: (_key: string, callback: () => () => void) => callback(),
      register: (options: { name: string; priority?: number }, component: unknown) => {
        const entry = { component, options } as unknown as StoredEntry
        entries.push(entry)
        active.set(options.name, entry)
        return () => {
          active.delete(options.name)
          const index = entries.indexOf(entry)
          if (index >= 0) entries.splice(index, 1)
        }
      },
      entries: () => entries,
      entriesOfSlot: () => entries.slice(0, 1),
      onEntryError: () => () => {},
      subscribe: (_key: string, listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      getVersion: () => version,
    },
  } as unknown as Context
  const registry = new RegionRegistry()
  const disposeOutlets = registerDirectoryFlowOutlets(ctx, registry)
  expect(active.size).toBe(0)
  const off = registry.registerContribution('workspace.directoryFlow', { id: 'mesh' }, () => (
    createElement('b', null, 'contribution')
  ))
  expect(active.size).toBe(2)
  const outlet = active.get('sidebar.workspaces.directoryFlow')!.component as (props: { open: boolean }) => ReturnType<typeof createElement>
  const html = renderToStaticMarkup(createElement(outlet, { open: true }))
  expect(html).toContain('original:native:true')
  expect(html).toContain('contribution')
  expect(html).not.toContain('[object Object]')
  off()
  off()
  expect(active.size).toBe(0)
  expect(entries).toEqual([original])
  disposeOutlets()
  expect(listeners.size).toBe(0)
})
