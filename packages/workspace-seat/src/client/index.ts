/**
 * Seat, browser half.
 *
 * The seat is the workspace region itself: it renders the vendored upstream
 * browser into `sidebar.workspaces`, so that region's behaviour, its child
 * slots and the row actions it ships stay exactly what the host and its other
 * client plugins expect from the official plugin.
 *
 * Upstream source is vendored under `vendor/ui-workspace` and is never edited
 * in place — every deviation is a patch in `patches/` — so a re-vendor is a
 * merge of our patches over the new upstream tree rather than a diff against a
 * file someone hand-edited.
 *
 * The only thing this module adds to the upstream apply is the decoration seam:
 * rows ask which machine a workspace lives on, and the answer comes from the
 * registered workspace sources rather than from anything this package knows
 * about machines.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-proton-workspace/client'
import { apply as applyBrowser, inject as browserInject } from '../../vendor/ui-workspace/src/client/index.ts'
import { installWorkspaceMarks } from './marks.ts'

/** Same services the official plugin needs; this seat adds no hard dependency. */
export const inject = browserInject

/**
 * Run the upstream apply, then wire the row decoration to the source ledger.
 * The ledger is optional: without `protonWorkspace` the region still renders,
 * and every row shows as a plain local workspace.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  applyBrowser(ctx)
  ctx.inject(['protonWorkspace'], (scoped) => {
    const sources = scoped.get('protonWorkspace')
    if (sources === undefined) return
    scoped.effect(
      () => installWorkspaceMarks({
        describe: path => sources.describe(path),
        subscribe: listener => sources.onMarkChange(listener),
      }),
      'seat: workspace marks',
    )
  })
}
