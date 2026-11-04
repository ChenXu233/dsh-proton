/**
 * Seat, browser half.
 *
 * The seat is the workspace region itself: it fills `sidebar.workspaces` with
 * the upstream browser, so that region's behaviour, its child slots and the
 * row actions it ships stay exactly what the host expects from the official
 * plugin. Upstream's source is vendored under `vendor/ui-workspace` and is
 * never edited in place — every deviation is a patch in `patches/` — so a
 * re-vendor is a merge of our patches over the new upstream tree, not a diff
 * against a file someone hand-edited.
 *
 * This module is the only place the seat chooses what to run: re-exports here,
 * decorator wiring here, and nothing that would change upstream behaviour for
 * every deployment.
 */
export { apply, inject } from '../../vendor/ui-workspace/src/client/index.ts'
