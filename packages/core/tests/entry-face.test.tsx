// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { EntryFace } from '../src/client/entry'

afterEach(() => cleanup())

const SLOT = 'demo.list'
const CHILD = 'demo.list.child'
type RawRegister = (options: object, component: unknown) => () => void

/** A core whose root entry declares the slots these cases register into. */
function coreWithSlots(): SlotCore {
  const core = new SlotCore()
  ;(core.register.bind(core) as unknown as RawRegister)({
    name: 'root',
    // Child slots are declared by the entry that owns them, not by the root.
    children: { [SLOT]: { kind: 'single', scope: 'root' } },
  }, () => null)
  return core
}

/** A context whose child-slot lookup reads a real SlotCore. */
function contextOver(core: SlotCore): Context {
  return {
    slots: {
      entriesOfSlot: (key: string) => core.entriesOfSlot(key),
      entries: (key: string) => core.entries(key),
      subscribe: (key: string, listener: () => void) => core.subscribe(key, listener),
      getVersion: (key: string) => core.getVersion(key),
      spec: (key: string) => core.spec(key as never),
    },
  } as unknown as Context
}

function registered(core: SlotCore, key: string, options: object, component: unknown): StoredEntry {
  const before = new Set(core.entries(key))
  ;(core.register.bind(core) as unknown as RawRegister)({ name: key, ...options }, component)
  return core.entries(key).find(candidate => !before.has(candidate))!
}

it('hands an entry its own inject face, a translator, and a store binding', () => {
  const core = coreWithSlots()
  const entry = registered(core, SLOT, { locale: 'workspace', store: { create: () => ({}) }, inject: () => ({ action: () => 'ran' }) }, (props: Record<string, unknown>) => (
    <span>{String((props.action as () => string)()) + '|' + String((props.t as (k: string) => string)('hello')) + '|' + String(props.bound)}</span>
  ))
  render(createElement(EntryFace, {
    ctx: contextOver(core),
    entry,
    sources: {
      translate: () => (key: string) => `t:${key}`,
      storeOf: () => ({ useStore: () => ({}), actions: {} }),
      standard: { bound: 'std' },
    },
  }))
  expect(screen.getByText('ran|t:hello|std')).toBeTruthy()
})

it('renders declared children through its own slot face', () => {
  const core = coreWithSlots()
  const entry = registered(core, SLOT, { children: { [CHILD]: { kind: 'list', scope: 'root' } } }, (props: Record<string, unknown>) => (
    <div>{(props.renderSlot as (key: string) => unknown)(CHILD) as never}</div>
  ))
  registered(core, CHILD, { id: 'row', inject: () => ({ label: 'child-row' }) }, (props: Record<string, unknown>) => <b>{String(props.label)}</b>)
  render(createElement(EntryFace, { ctx: contextOver(core), entry }))
  expect(screen.getByText('child-row')).toBeTruthy()
})

it('fails loudly when a declared locale has no translator', () => {
  const core = coreWithSlots()
  const entry = registered(core, SLOT, { locale: 'workspace' }, () => <span>never</span>)
  expect(() => render(createElement(EntryFace, { ctx: contextOver(core), entry }))).toThrow(/no translator/)
})

it('fails loudly when a declared store has no resolver', () => {
  const core = coreWithSlots()
  const entry = registered(core, SLOT, { store: { create: () => ({}) } }, () => <span>never</span>)
  expect(() => render(createElement(EntryFace, { ctx: contextOver(core), entry }))).toThrow(/no store resolver/)
})

it('applies the cell inject to its entries and binds hook factories from the occurrence context', () => {
  const core = coreWithSlots()
  const parent = registered(core, SLOT, {
    children: {
      [CHILD]: {
        kind: 'single',
        scope: 'root',
        // The host applies a cell's own inject to every entry of that cell; a
        // chat node seat receives its turn-data hooks exactly this way.
        inject: {
          hooks: {
            cellData: (_standard: unknown, context: unknown) => (key: string) => `${String(context)}:${key}`,
          },
        },
      },
    },
  }, (props: Record<string, unknown>) => (
    <div>{(props.renderSlot as (key: string, owner: object, opts: object) => unknown)(CHILD, {}, { hookContext: 'occ' }) as never}</div>
  ))
  registered(core, CHILD, {}, (props: Record<string, unknown>) => (
    <b>{String((props.useCellData as (key: string) => string)('row'))}</b>
  ))
  render(createElement(EntryFace, { ctx: contextOver(core), entry: parent }))
  expect(screen.getByText('occ:row')).toBeTruthy()
})

it('renders only the keyed child the caller names', () => {
  const core = coreWithSlots()
  const parent = registered(core, SLOT, {
    children: { [CHILD]: { kind: 'keyed', scope: 'root' } },
  }, (props: Record<string, unknown>) => (
    <div>{(props.renderSlot as (key: string, owner: object, opts: object) => unknown)(CHILD, {}, { entryKey: 'user' }) as never}</div>
  ))
  registered(core, CHILD, { key: 'user' }, () => <b>user-row</b>)
  registered(core, CHILD, { key: 'tool' }, () => <b>tool-row</b>)
  render(createElement(EntryFace, { ctx: contextOver(core), entry: parent }))
  expect(screen.getByText('user-row')).toBeTruthy()
  expect(screen.queryByText('tool-row')).toBeNull()
})