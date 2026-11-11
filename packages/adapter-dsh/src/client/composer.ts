/**
 * The shipped composer's seat, taken only while someone wants the submit tap.
 *
 * Taking the composer seat is not part of the workspace job: a composition that
 * installs this adapter for the workspace seats must keep the shipped composer's
 * own rendering. The first addSubmitTap() mounts the seat; the last disposer
 * releases it, and the shipped composer draws itself again.
 */

/** Handle to the seat. */
export interface ComposerSeat {
  /**
   * Ask the shipped composer to consult plugins before it sends.
   * @returns disposer; the seat leaves with the last one.
   */
  addSubmitTap(): () => void
  /** Release the seat and every outstanding tap (plugin unload). */
  dispose(): void
}

/**
 * Reference-count the seat around one mount function.
 * @param mount - registers the seat and returns its disposer.
 * @returns the tap handle.
 */
export function createComposerSeat(mount: () => () => void): ComposerSeat {
  let taps = 0
  let stop: (() => void) | undefined

  function release(): void {
    const current = stop
    stop = undefined
    current?.()
  }

  return {
    addSubmitTap() {
      taps += 1
      if (stop === undefined) stop = mount()
      let live = true
      return () => {
        if (!live) return
        live = false
        taps = Math.max(0, taps - 1)
        if (taps === 0) release()
      }
    },
    dispose() {
      taps = 0
      release()
    },
  }
}
