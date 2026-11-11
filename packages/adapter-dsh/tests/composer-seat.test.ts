import { expect, it, vi } from 'vitest'
import { createComposerSeat } from '../src/client/composer'

it('mounts on the first tap and releases after the last', () => {
  const stop = vi.fn()
  const mount = vi.fn(() => stop)
  const seat = createComposerSeat(mount)

  expect(mount).not.toHaveBeenCalled()

  const first = seat.addSubmitTap()
  const second = seat.addSubmitTap()
  expect(mount).toHaveBeenCalledTimes(1)

  first()
  first() // idempotent
  expect(stop).not.toHaveBeenCalled()

  second()
  expect(stop).toHaveBeenCalledTimes(1)

  seat.addSubmitTap()
  expect(mount).toHaveBeenCalledTimes(2)
})

it('dispose releases the seat and drops outstanding taps', () => {
  const stop = vi.fn()
  const mount = vi.fn(() => stop)
  const seat = createComposerSeat(mount)
  const tap = seat.addSubmitTap()

  seat.dispose()
  expect(stop).toHaveBeenCalledTimes(1)

  tap()
  expect(stop).toHaveBeenCalledTimes(1)

  seat.addSubmitTap()
  expect(mount).toHaveBeenCalledTimes(2)
})
