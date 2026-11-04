import { useSyncExternalStore } from 'react'
import type { SourceMark } from 'dsh-proton-workspace/client'

/** Where one workspace directory came from, as its source reports it. */
export interface WorkspaceMark extends SourceMark {
  /** Id of the source that claimed the directory. */
  readonly sourceId: string
  /** Operator-facing name of that source. */
  readonly sourceLabel: string
}

/** Answers "where does this directory come from" for one path. */
export type WorkspaceDescribe = (path: string) => WorkspaceMark | undefined

/** Nothing registered yet: every row is an ordinary local workspace. */
const noMark: WorkspaceDescribe = () => undefined

let describe: WorkspaceDescribe = noMark
const listeners = new Set<() => void>()
let version = 0

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const getVersion = (): number => version

const changed = (): void => {
  version += 1
  for (const listener of [...listeners]) listener()
}

/**
 * Point the row decoration at the current source ledger, and undo that when the
 * fiber owning it goes away.
 *
 * The decoration lives in the vendored renderer, which cannot reach the client
 * context, so the seam is a module singleton rather than a React context: one
 * seat, one ledger, and a store that reads as "nothing to show" while no ledger
 * is installed.
 *
 * @param next - describes a directory, or returns undefined when nothing claims it.
 * @returns disposer that restores the empty answer.
 */
export function installWorkspaceMarks(next: WorkspaceDescribe): () => void {
  describe = next
  changed()
  return () => {
    // A later install owns the slot now; its disposer restores the empty answer.
    if (describe !== next) return
    describe = noMark
    changed()
  }
}

/**
 * Where the workspace at `cwd` lives, re-read whenever the source ledger
 * changes. Rows render on every keystroke of the browser's search box, so this
 * must stay a map lookup over state the source already holds.
 *
 * @param cwd - the workspace directory shown by the row.
 * @returns the mark, or undefined for an ordinary local workspace.
 */
export function useWorkspaceMark(cwd: string | undefined): WorkspaceMark | undefined {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  return cwd === undefined ? undefined : describe(cwd)
}
