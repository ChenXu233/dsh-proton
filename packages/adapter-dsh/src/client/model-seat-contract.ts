/**
 * The shipped model seat's routing contract.
 *
 * Kept apart from the client entry on purpose: that entry imports the official
 * ui-workspace types for the directory-flow seats, and a consumer that only
 * needs this contract must not drag those declarations into its type program.
 */

import type {} from '@deepseek-ai/cordis'

/** One route the shipped pickers can submit. */
export interface ModelSeatSelection {
  /** Provider id the picker chose. */
  readonly provider: string
  /** Model id inside that provider. */
  readonly model: string
  /** Reasoning effort, when the picker submitted one. */
  readonly reasoningEffort?: string
}

/**
 * What the shipped pickers do with a selection result.
 *
 * `ModelSelect` reads `{ ok, error: { code, message } }` and toasts the error;
 * `@hytime/dsh-thinking-effort`'s `Slider` ignores the value entirely, which is
 * why a rejection is not an option: it escapes the Slider unhandled.
 */
export type ModelSeatResult =
  | { readonly ok: true }
  | { readonly ok: false, readonly error: { readonly code: string, readonly message: string } }

/**
 * The kit members a router may replace for one session.
 *
 * Everything omitted keeps the shipped behaviour for that session. `directory`
 * is the risky one: the shipped face already carries the model groups (with the
 * reasoning metadata the effort menu needs) and the session's own selection
 * projection, so replacing it means reproducing both.
 */
export interface ModelSeatRouting {
  /** Whether a shipped picker should render at all. */
  readonly available?: boolean
  /** Apply one selection. */
  readonly select?: (selection: ModelSeatSelection) => Promise<ModelSeatResult>
  /** Refresh what the picker opens with. */
  readonly load?: () => void
  /** Replace the directory face the pickers read. */
  readonly directory?: unknown
}

/**
 * Decide the seat's routing for one session.
 *
 * Called during kit assembly, once per entry and session. Returning undefined
 * passes to the next router; when every router passes, the session gets the
 * shipped routing untouched.
 * @param sessionId - session the composer belongs to, when the seat knows it.
 * @returns the routing for that session, or undefined to pass.
 */
export type ModelSeatRouter = (sessionId: string | undefined) => ModelSeatRouting | undefined

/**
 * The shipped model seat's routing seam.
 *
 * Taking this seat is not part of the workspace job: a composition that
 * installs this adapter for the workspace seats must keep the shipped picker's
 * own rendering. The seat is mounted by the first router and released by the
 * last, so a composition with no router renders exactly what the host ships.
 */
export interface ProtonModelSeatService {
  /**
   * Ask the shipped model seat to consult this router before it uses its own
   * routing. Routers are asked in registration order.
   * @param router - per-session routing decision.
   * @returns disposer; the seat leaves with the last one.
   */
  addRouter(router: ModelSeatRouter): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The model seat routing seam; present while this adapter is mounted. */
    protonModelSeat: ProtonModelSeatService
  }
}
