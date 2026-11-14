import { expect, it, vi } from 'vitest'
import { applyModelSeatRouting, createModelSeat } from '../src/client/model-seat'

it('mounts on the first router and releases after the last', () => {
  const stop = vi.fn()
  const mount = vi.fn(() => stop)
  const seat = createModelSeat(mount)
  const router = () => undefined

  expect(mount).not.toHaveBeenCalled()

  const first = seat.addRouter(router)
  const second = seat.addRouter(router)
  expect(mount).toHaveBeenCalledTimes(1)

  first()
  first() // idempotent
  expect(stop).not.toHaveBeenCalled()

  second()
  expect(stop).toHaveBeenCalledTimes(1)

  seat.addRouter(router)
  expect(mount).toHaveBeenCalledTimes(2)
})

it('dispose releases the seat and drops outstanding routers', () => {
  const stop = vi.fn()
  const mount = vi.fn(() => stop)
  const seat = createModelSeat(mount)
  const router = vi.fn(() => ({ available: true }))
  const dispose = seat.addRouter(router)

  expect(seat.routing('child-1')).toEqual({ available: true })
  seat.dispose()
  expect(stop).toHaveBeenCalledTimes(1)
  expect(seat.routing('child-1')).toBeUndefined()

  dispose()
  expect(stop).toHaveBeenCalledTimes(1)
})

it('the first router that answers wins and passes are skipped', () => {
  const seat = createModelSeat(() => () => {})
  const first = vi.fn((sessionId: string | undefined) => (sessionId === 'parent' ? undefined : { available: false }))
  const second = vi.fn(() => ({ available: true }))
  seat.addRouter(first)
  seat.addRouter(second)

  expect(seat.routing('parent')).toEqual({ available: true })
  expect(first).toHaveBeenCalledWith('parent')
  expect(second).toHaveBeenCalledWith('parent')

  expect(seat.routing('child')).toEqual({ available: false })
  expect(second).toHaveBeenCalledTimes(1)
})

it('no router means no routing, so the shipped kit is handed back', () => {
  const seat = createModelSeat(() => () => {})
  expect(seat.routing('child')).toBeUndefined()
})

it('routing replaces only the members it names', () => {
  const directory = { getSnapshot: () => ({}) }
  const t = () => 'label'
  const renderSlot = () => null
  const shippedSelect = () => 'shipped'
  const kit = { available: false, directory, select: shippedSelect, load: () => {}, t, renderSlot, locked: true }

  const available = applyModelSeatRouting(kit, { available: true })
  expect(available).toEqual({ ...kit, available: true })
  expect(available['select']).toBe(shippedSelect)
  expect(available['directory']).toBe(directory)

  const select = vi.fn(async () => ({ ok: true } as const))
  const routed = applyModelSeatRouting(kit, { available: true, select, load: () => {} })
  expect(routed['available']).toBe(true)
  expect(routed['select']).toBe(select)
  expect(routed['t']).toBe(t)
  expect(routed['renderSlot']).toBe(renderSlot)
  // A router that stays silent about the directory keeps the shipped one: the
  // model groups (with their reasoning metadata) are not something to re-derive.
  expect(routed['directory']).toBe(directory)
  expect(Object.keys(routed).sort()).toEqual(Object.keys(kit).sort())
})
