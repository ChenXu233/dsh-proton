// @vitest-environment jsdom
import { useEffect, useSyncExternalStore } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { registerDirectoryFlowOutlets } from '../src/client/native'
import { OriginalSlotEntry } from '../src/client/original'
import { RegionRegistry } from '../src/client/region'

const SIDEBAR = 'sidebar.workspaces.directoryFlow'
const HERO = 'conversation.hero.workspace.directoryFlow'
type RawRegister = (options: object, component: unknown) => () => void

afterEach(() => cleanup())

it('follows live original entries without remount mistakes or abdicated fallbacks', async () => {
  const core = new SlotCore()
  const register = core.register.bind(core) as unknown as RawRegister
  const disposeRoot = register({ name: 'root', children: {
    [SIDEBAR]: { kind: 'single', scope: 'root' },
    [HERO]: { kind: 'single', scope: 'root' },
  } }, () => null)
  const events: string[] = []
  const Flow = ({ label, open }: { label: string; open: boolean }) => {
    useEffect(() => {
      events.push(`mount:${label}`)
      return () => { events.push(`unmount:${label}`) }
    }, [])
    return <span>original:{label}:{String(open)}</span>
  }
  const addEntry = (name: string, label: string, priority = 0) => {
    const before = new Set(core.entries(name))
    const dispose = register({ name, priority, inject: () => ({ label }) }, Flow)
    const entry = core.entries(name).find(candidate => !before.has(candidate))!
    return { entry, dispose }
  }
  const sidebarA = addEntry(SIDEBAR, 'side-a')
  addEntry(HERO, 'hero-a')
  const historical = addEntry(SIDEBAR, 'historical', 10)
  core.reportEntryError(SIDEBAR, historical.entry, new Error('retired before Proton'), { abdicate: true })

  const listeners = new Set<() => void>()
  const subscribe = (key: string, listener: () => void) => {
    listeners.add(listener)
    const unsubscribe = core.subscribe(key, listener)
    return () => { listeners.delete(listener); unsubscribe() }
  }
  const ctx = {
    slots: {
      inject: (_key: string, callback: () => () => void) => callback(),
      register,
      entries: (key: string) => core.entries(key),
      entriesOfSlot: (key: string) => core.entriesOfSlot(key),
      subscribe,
      getVersion: (key: string) => core.getVersion(key),
      onEntryError: core.onEntryError.bind(core),
    },
  } as unknown as Context
  const registry = new RegionRegistry()
  const disposeOutlets = registerDirectoryFlowOutlets(ctx, registry)
  let offContribution!: () => void
  await act(async () => {
    offContribution = registry.registerContribution('workspace.directoryFlow', { id: 'mesh' }, () => <b>contribution</b>)
    await Promise.resolve()
  })

  const Harness = ({ name }: { name: string }) => {
    useSyncExternalStore(listener => subscribe(name, listener), () => core.getVersion(name))
    const entry = core.entriesOfSlot(name)[0]
    return entry === undefined ? null : <OriginalSlotEntry entry={entry} owner={{ open: true }} />
  }
  const view = render(<><Harness name={SIDEBAR} /><Harness name={HERO} /></>)
  expect(screen.getByText('original:side-a:true')).toBeTruthy()
  expect(screen.getByText('original:hero-a:true')).toBeTruthy()
  expect(screen.getAllByText('contribution')).toHaveLength(2)

  let sidebarB!: ReturnType<typeof addEntry>
  await act(async () => {
    sidebarA.dispose()
    sidebarB = addEntry(SIDEBAR, 'side-b')
    await Promise.resolve()
  })
  expect(screen.getByText('original:side-b:true')).toBeTruthy()
  expect(events).toContain('unmount:side-a')
  expect(events).toContain('mount:side-b')

  await act(async () => { sidebarB.dispose(); await Promise.resolve() })
  expect(screen.queryByText(/original:side-b/)).toBeNull()
  expect(screen.queryByText(/original:historical/)).toBeNull()

  const sidebarC = addEntry(SIDEBAR, 'side-c')
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('original:side-c:true')).toBeTruthy()
  await act(async () => {
    core.reportEntryError(SIDEBAR, sidebarC.entry, new Error('retired while Proton is active'), { abdicate: true })
    await Promise.resolve()
  })
  expect(screen.queryByText(/original:side-c/)).toBeNull()
  expect(screen.queryByText(/original:historical/)).toBeNull()

  await act(async () => { offContribution(); await Promise.resolve() })
  expect(screen.getByText('original:hero-a:true')).toBeTruthy()
  expect(screen.queryByText('contribution')).toBeNull()
  view.unmount()
  disposeOutlets()
  disposeRoot()
  expect(listeners.size).toBe(0)
})
