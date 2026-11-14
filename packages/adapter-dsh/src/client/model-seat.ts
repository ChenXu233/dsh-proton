/**
 * The shipped model seat, taken only while a router wants it.
 *
 * The host's entry is a single slot: taking it is only worth doing when
 * somebody actually routes a session somewhere else. The first router mounts
 * the seat, the last disposer releases it, and the shipped picker draws itself
 * again — the same demand-driven shape the composer seat uses.
 */

import type { ModelSeatRouter, ModelSeatRouting } from './model-seat-contract'

/** Handle to the seat. */
export interface ModelSeat {
  /**
   * Add one router; it is asked before every router registered later.
   * @returns disposer; the seat leaves with the last one.
   */
  addRouter(router: ModelSeatRouter): () => void
  /**
   * The routing for one session: the first router that answers wins.
   * @param sessionId - session the composer belongs to.
   * @returns the routing, or undefined when every router passed.
   */
  routing(sessionId: string | undefined): ModelSeatRouting | undefined
  /** Release the seat and every outstanding router (plugin unload). */
  dispose(): void
}

/**
 * Reference-count the seat around one mount function.
 * @param mount - registers the seat and returns its disposer.
 * @returns the seat handle.
 */
export function createModelSeat(mount: () => () => void): ModelSeat {
  const routers: ModelSeatRouter[] = []
  let stop: (() => void) | undefined

  function release(): void {
    const current = stop
    stop = undefined
    current?.()
  }

  return {
    addRouter(router) {
      routers.push(router)
      if (stop === undefined) stop = mount()
      let live = true
      return () => {
        if (!live) return
        live = false
        const index = routers.indexOf(router)
        if (index >= 0) routers.splice(index, 1)
        if (routers.length === 0) release()
      }
    },
    routing(sessionId) {
      for (const router of routers) {
        const routing = router(sessionId)
        if (routing !== undefined) return routing
      }
      return undefined
    },
    dispose() {
      routers.length = 0
      release()
    },
  }
}

/**
 * Apply one routing to the kit the shipped entry receives.
 *
 * Only the members the router named are replaced: the shipped `directory`,
 * `t`, `renderSlot` and `resolveText` keep flowing, which is what lets a
 * router change where a selection goes without reproducing the model catalog.
 * @param kit - the kit proton assembled for the winning entry.
 * @param routing - the decision for this session.
 * @returns the kit the entry actually receives.
 */
export function applyModelSeatRouting(
  kit: Record<string, unknown>,
  routing: ModelSeatRouting,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...kit }
  if (routing.available !== undefined) next['available'] = routing.available
  if (routing.select !== undefined) next['select'] = routing.select
  if (routing.load !== undefined) next['load'] = routing.load
  if (routing.directory !== undefined) next['directory'] = routing.directory
  return next
}
