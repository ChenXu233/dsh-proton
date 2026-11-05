// @vitest-environment jsdom
import { createElement, useSyncExternalStore } from 'react'
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

/** Renders whatever currently wins the seat, the way the shell would. */
function Seat({ core }: { core: SlotCore }) {
  useSyncExternalStore(
    listener => core.subscribe(SLOT, listener),
    () => core.getVersion(SLOT),
  )
  const winner = core.entriesOfSlot(SLOT)[0]
  return winner === undefined ? null : createElement(OriginalSlotEntry, { entry: winner, owner: {} })
}

/**
 * Build a context over a real SlotCore. `entriesOfSlot` can be made to lag for
 * one call, which is the window an outlet wires up in: the shipped entry is
 * already registered but not yet reported as the winner.
 */
function harness(options: { lagWinner?: boolean, slotChildren?: Record<string, unknown>, rejectChildren?: boolean } = {}) {
  const core = new SlotCore()
  const register = core.register.bind(core) as unknown as RawRegister
  const disposeRoot = register({ name: 'root', children: { [SLOT]: { kind: 'single', scope: 'root' } } }, () => null)
  const add = (component: unknown, copy: { priority?: number, children?: Record<string, unknown> } = {}) => {
    const before = new Set(core.entries(SLOT))
    const spec: Record<string, unknown> = { name: SLOT, priority: copy.priority ?? 0 }
    if (copy.children !== undefined) spec.children = copy.children
    const dispose = register(spec, component)
    const entry = core.entries(SLOT).find(candidate => !before.has(candidate))!
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
  // A real registry rejects a child declaration that is already on the ledger.
  const outletRegister = options.rejectChildren === true
    ? ((spec: Record<string, unknown>, component: unknown) => {
        if (spec.children !== undefined) throw new Error('slot already declared')
        return register(spec, component)
      })
    : register
  const ctx = {
    slots: {
      inject: (_key: string, callback: () => () => void) => callback(),
      register: outletRegister,
      entries: (key: string) => core.entries(key),
      entriesOfSlot,
      subscribe: (key: string, listener: () => void) => core.subscribe(key, listener),
      getVersion: (key: string) => core.getVersion(key),
      onEntryError: core.onEntryError.bind(core),
    },
  } as unknown as Context
  const registry = new RegionRegistry()
  const outlet: Record<string, unknown> = { slot: SLOT, region: 'test.list' }
  if (options.slotChildren !== undefined) outlet.children = options.slotChildren
  const disposeOutlets = connectSlots(ctx, registry, [outlet as never])
  return { core, registry, disposeOutlets, disposeRoot, add }
}

it('captures the shipped entry even when the winner list lags at wiring time', async () => {
  const h = harness({ lagWinner: true })
  const shipped = h.add(() => 'shipped')
  let off!: () => void
  await act(async () => {
    off = h.registry.registerContribution('test.list', { id: 'demo' }, () => createElement('b', null, 'contribution'))
    await Promise.resolve()
  })
  render(createElement(Seat, { core: h.core }))
  // The point is that the outlet exists at all: a rejected declaration used to
  // take the whole outlet down, which renders the region empty.
  expect(screen.getByText('contribution')).toBeTruthy()
  await act(async () => { off(); await Promise.resolve() })
  h.disposeOutlets()
  h.disposeRoot()
  shipped.dispose()
})

it('never resurrects an entry that abdicated before the outlet existed', async () => {
  const h = harness()
  const shipped = h.add(() => 'shipped')
  const retired = h.add(() => 'retired', { priority: 10 })
  h.core.reportEntryError(SLOT, retired.entry, new Error('gone'), { abdicate: true })
  let off!: () => void
  await act(async () => {
    off = h.registry.registerContribution('test.list', { id: 'demo' }, () => createElement('b', null, 'contribution'))
    await Promise.resolve()
  })
  render(createElement(Seat, { core: h.core }))
  expect(screen.getByText('shipped')).toBeTruthy()
  expect(screen.queryByText('retired')).toBeNull()
  await act(async () => { off(); await Promise.resolve() })
  h.disposeOutlets()
  h.disposeRoot()
  shipped.dispose()
})
