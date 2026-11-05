// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { connectSlots } from '../src/client/slot'
import { OriginalSlotEntry } from '../src/client/original'
import { RegionRegistry } from '../src/client/region'

declare module '../src/client/index' {
  interface ProtonRegionMap {
    'test.list': { context: Record<string, unknown> }
  }
}

const SLOT = 'demo.list'
type RawRegister = (options: object, component: unknown) => () => void

afterEach(() => cleanup())

/**
 * Build a context over a real SlotCore. `entriesOfSlot` can be made to lag for
 * one call, which is the window an outlet wires up in: the shipped entry is
 * already registered but not yet reported as the winner.
 */
function harness(options: { lagWinner?: boolean } = {}) {
  const core = new SlotCore()
  const register = core.register.bind(core) as unknown as RawRegister
  const disposeRoot = register({ name: 'root', children: { [SLOT]: { kind: 'single', scope: 'root' } } }, () => null)
  const Shipped = () => <span>shipped</span>
  const entryCount = { value: 0 }
  const add = (component: unknown, priority = 0) => {
    const before = new Set(core.entries(SLOT))
    const dispose = register({ name: SLOT, priority }, component)
    const entry = core.entries(SLOT).find(candidate => !before.has(candidate))!
    entryCount.value += 1
    return { entry, dispose }
  }
  let lagged = false
  const entriesOfSlot = (key: string) => {
    if (options.lagWinner === true && !lagged) {
      lagged = true
      return []
    }
    return core.entriesOfSlot(key)
  }
  const subscribe = (key: string, listener: () => void) => core.subscribe(key, listener)
  const ctx = {
    slots: {
      inject: (_key: string, callback: () => () => void) => callback(),
      register,
      entries: (key: string) => core.entries(key),
      entriesOfSlot,
      subscribe,
      getVersion: (key: string) => core.getVersion(key),
      onEntryError: core.onEntryError.bind(core),
    },
  } as unknown as Context
  const registry = new RegionRegistry()
  const disposeOutlets = connectSlots(ctx, registry, [{ slot: SLOT, region: 'test.list' }])
  const Harness = () => {
    useSyncExternalStore(listener => subscribe(SLOT, listener), () => core.getVersion(SLOT))
    const winner = core.entriesOfSlot(SLOT)[0]
    return winner === undefined ? null : <OriginalSlotEntry entry={winner} owner={{}} />
  }
  return { core, registry, disposeOutlets, disposeRoot, add, Shipped, Harness }
}

it('captures the shipped entry even when the winner list lags at wiring time', async () => {
  const h = harness({ lagWinner: true })
  const shipped = h.add(h.Shipped)
  let off!: () => void
  await act(async () => {
    off = h.registry.registerContribution('test.list', { id: 'demo' }, () => <b>contribution</b>)
    await Promise.resolve()
  })
  render(<h.Harness />)
  expect(screen.getByText('contribution')).toBeTruthy()
  expect(screen.getByText('shipped')).toBeTruthy()
  await act(async () => { off(); await Promise.resolve() })
  h.disposeOutlets()
  h.disposeRoot()
  shipped.dispose()
})

it('never resurrects an entry that abdicated before the outlet existed', async () => {
  const h = harness()
  const shipped = h.add(h.Shipped)
  const retired = h.add(() => <span>retired</span>, 10)
  h.core.reportEntryError(SLOT, retired.entry, new Error('gone'), { abdicate: true })
  let off!: () => void
  await act(async () => {
    off = h.registry.registerContribution('test.list', { id: 'demo' }, () => <b>contribution</b>)
    await Promise.resolve()
  })
  render(<h.Harness />)
  expect(screen.getByText('shipped')).toBeTruthy()
  expect(screen.queryByText('retired')).toBeNull()
  await act(async () => { off(); await Promise.resolve() })
  h.disposeOutlets()
  h.disposeRoot()
  shipped.dispose()
})
