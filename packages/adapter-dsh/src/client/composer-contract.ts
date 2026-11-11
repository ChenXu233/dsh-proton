/**
 * The composer submit contract.
 *
 * Kept apart from the client entry on purpose: that entry imports the official
 * ui-workspace types for the directory-flow seats, and a consumer that only
 * needs this contract must not drag those declarations into its type program.
 */

import type {} from '@deepseek-ai/cordis'

/** One submit the composer is about to perform. */
export interface ComposerSubmitRequest {
  /** Serialized draft text (plain text; reference chips are projected by the shell). */
  readonly text: string
  /** Delivery mode the composer resolved. */
  readonly mode: string
  /** Which gesture asked for it, when the composer says. */
  readonly source?: string | undefined
  /** Session the draft belongs to, when the seat exposes it. */
  readonly sessionId?: string | undefined
  /** Clear the draft after a listener claims the submit. */
  readonly clear: () => void
}

/**
 * The shipped composer's submit tap.
 *
 * Taking the composer seat is not part of the workspace job: a composition that
 * installs this adapter for the workspace seats must keep the shipped composer's
 * own rendering. The seat is mounted by the first tap and released by the last.
 */
export interface ProtonComposerService {
  /**
   * Ask the shipped composer to consult proton/composer-submit before it sends.
   * @returns disposer; the seat leaves with the last one.
   */
  addSubmitTap(): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The composer submit tap; present while this adapter is mounted. */
    protonComposer: ProtonComposerService
  }
  interface Events {
    /**
     * The shipped composer is about to submit. A listener returns true to take
     * the submit over; the shipped send is then skipped and the composer keeps
     * its draft unless the listener clears it.
     * @mode bail
     */
    'proton/composer-submit'(request: ComposerSubmitRequest): boolean | undefined
  }
}
