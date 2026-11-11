import type { Context } from '@deepseek-ai/cordis'
import { useRef, useSyncExternalStore } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { createComposerSeat } from './composer'
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from 'dsh-proton/client'
import type { EntryKitSources, SplitState, SplitStore } from 'dsh-proton/client'

/**
 * The two official seats a directory-picker backend's client half fills. Their
 * owner contract is the shipped `open` / `busy` / `onPicked` / `onCancel` /
 * `onError` interaction; this adapter is the only package allowed to know it.
 */
export const DIRECTORY_FLOW_SLOTS = [
  'sidebar.workspaces.directoryFlow',
  'conversation.hero.workspace.directoryFlow',
] as const

/** Region a directory-flow decorator targets. */
export const DIRECTORY_FLOW_REGION = 'workspace.directoryFlow' as const

/**
 * The seat holding the whole workspace list. A domain that takes it can render
 * its own sections beside the shipped one, or replace it outright — the region
 * is the workspace domain's home, the directory flow above is only one child
 * of the UI it inherits.
 */
export const WORKSPACES_SLOT = 'sidebar.workspaces' as const

/** Region a workspace-list decorator targets. */
export const WORKSPACES_REGION = 'workspace.list' as const

/**
 * The shipped composer body. This adapter takes the seat only to hand the
 * submit verb to other plugins first: the composer's own kit is otherwise
 * untouched, so a composition with no listener behaves exactly as shipped.
 */
export const COMPOSER_SLOT = 'conversation.composer.bar' as const
/** Region the composer seat shadows (it hosts no content of its own). */
export const COMPOSER_REGION = 'composer.bar' as const

/**
 * Child slots the shipped workspace list declares along with its own
 * registration. An outlet shadows that registration, so it inherits the whole
 * contract — the directory flow below the list must keep existing even when
 * nothing but our own sections render the region.
 */
export const WORKSPACES_CHILDREN = {
  'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' },
} as const

/** The shipped owner contract, re-exported so domains never import ui-workspace themselves. */
export type DirectoryFlowContext = DirectoryFlowOwnerProps

// The composer contract lives in its own module so consumers can import it
// without pulling the official ui-workspace declarations above.
export type { ComposerSubmitRequest, ProtonComposerService } from './composer-contract'

declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    'workspace.directoryFlow': { context: DirectoryFlowContext }
    /** Owner props the shipped list passes down; opaque to this adapter. */
    'workspace.list': { context: Record<string, unknown> }
    /** Owner props of the shipped composer body; opaque here. */
    'composer.bar': { context: Record<string, unknown> }
  }
}

export const inject = ['slots', 'proton', 'locale'] as const

/**
 * Split ratios live beside the host's own view state: the client store engine
 * with the same `persist` mechanism the shipped workspace browser uses for its
 * grouping and order, not a private key scheme.
 * @returns the store face the proton split pane reads.
 */
function createSplitStore(): SplitStore {
  const handle = defineStore({
    init: (): SplitState => ({ ratios: {} }),
    persist: 'dsh.proton.split.v1',
    actions: {
      setRatio: (draft: SplitState, slot: string, ratio: number) => {
        draft.ratios[slot] = ratio
      },
    },
  })
  return handle.create() as unknown as SplitStore
}

/** The slice of a stored entry this adapter inspects. */
interface RawEntry {
  component: unknown
  locale?: string
  registrant?: string | undefined
  options?: { name?: unknown }
  store?: { create?: () => { getSnapshot?: () => unknown, subscribe?: (fn: () => void) => () => void, actions?: unknown } }
}

/** Observable face of a locale service. */
interface LocaleLike {
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

/** The injected composer verb this adapter wraps. */
interface ComposerKeyboardLike {
  readonly editor?: unknown
  submit(mode: string, source?: string): void
  [key: string]: unknown
}

const storeInstances = new WeakMap<object, { useStore: unknown, actions: unknown }>()

/**
 * Bind an entry's declared store into the two props the host would hand over.
 *
 * One instance per entry and one subscribe/getSnapshot pair per instance: a
 * fresh pair per render resubscribes every frame, and a source that notifies on
 * subscribe turns that into an unbounded loop.
 * @param entry - the entry declaring the store.
 * @returns `useStore` and `actions`, or undefined when the seat has no store.
 */
function storeSeat(entry: RawEntry, sessionId?: string): { useStore: unknown, actions: unknown } | undefined {
  const key = (entry as object)
  const cached = storeInstances.get(key)
  if (cached !== undefined && sessionId === undefined) return cached
  const decl = entry.store
  if (decl === undefined || typeof decl.create !== 'function') return undefined
  const instance = decl.create()
  if (typeof instance.getSnapshot !== 'function' || typeof instance.subscribe !== 'function') return undefined

  function useStore<T>(selector: (snapshot: never) => T): T {
    const subscribe = useRef((listener: () => void) => instance.subscribe!(listener)).current
    const getSnapshot = useRef((): T => selector(instance.getSnapshot!() as never)).current
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }

  const bound = { useStore, actions: instance.actions }
  if (sessionId === undefined) storeInstances.set(key, bound)
  return bound
}

/**
 * Standard (root-provided) props among a seat's occupant props.
 *
 * The host renderer injects the root standard kit into every occupant; proton's
 * seat gets the same values as owner props. Child slots rendered through the
 * entry face need that kit too, so the seat passes the standard-looking members
 * down as `standard` (the host's own vocabulary: `use*` hooks and the factory
 * slot renderer).
 * @param owner - the outlet's props.
 * @returns the standard props only.
 */
function standardOf(owner: Record<string, unknown>): Record<string, unknown> {
  const standard: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(owner)) {
    if (/^use[A-Z]/u.test(key) || key === 'renderFactorySlot') standard[key] = value
  }
  return standard
}

/**
 * The session the composer belongs to.
 *
 * The shipped composer bar is a `session-maybe` seat: its inject factory is
 * called with the session id, and the host renderer takes that id from the
 * session scope. A takeover outside that renderer has no scope to read, and the
 * shell's own navigation writes the current session here first — so this is the
 * one order-safe source for the id.
 * @returns the current main session id, or undefined before the first selection.
 */
export function currentSessionId(): string | undefined {
  try {
    const raw = globalThis.localStorage?.getItem('dsh.sessions.current')
    if (raw === null || raw === undefined) return undefined
    const parsed = JSON.parse(raw) as { sessionId?: unknown }
    return typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined
  } catch {
    return undefined
  }
}

/**
 * Read the composer's draft as plain text.
 *
 * The draft lives in the shell's Lexical editor and no public serializer is
 * exported; the editor state's JSON is the only reachable projection. Text nodes
 * are concatenated, paragraphs become newlines, and any node that carries its
 * own `text` (a reference chip's label) is kept as-is.
 * @param editor - the composer's editor handle from its injected face.
 * @returns the draft text, trimmed; empty when the editor is not readable yet.
 */
export function draftText(editor: unknown): string {
  const state = (editor as { getEditorState?: () => { toJSON?: () => unknown } } | undefined)?.getEditorState?.()
  const json = state?.toJSON?.()
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const type = record['type']
    if (type === 'text' && typeof record['text'] === 'string') {
      parts.push(record['text'])
      return
    }
    const children = record['children']
    if (Array.isArray(children)) {
      const before = parts.length
      for (const child of children) walk(child)
      if ((type === 'paragraph' || type === 'heading' || type === 'listitem') && parts.length > before) parts.push('\n')
      return
    }
    if (typeof record['text'] === 'string') parts.push(record['text'])
  }
  walk((json as { root?: unknown } | undefined)?.root)
  return parts.join('').replace(/\n+$/u, '').trim()
}

/**
 * Kit sources for the composer seat: hand its submit verb to `ctx.bail`.
 *
 * The wrapped verb is the shipped one plus one question asked first: does any
 * listener want this submit? Nobody answering means the original call runs in
 * the same tick, so the shipped composer (and every other plugin's expectation
 * of it) is unchanged.
 *
 * The outlet supplies these sources directly instead of registering an entry
 * provider: `StoredEntry.options` carries no slot name, so a provider could not
 * tell the composer apart from its sibling entries, and claiming the wrong one
 * would replace a working seat with an error.
 * @param ctx - client root context.
 * @returns kit sources for the composer entry.
 */
export function composerKitSources(ctx: Context): EntryKitSources {
  const locale = (ctx as unknown as { locale?: LocaleLike }).locale
  return {
    translate: namespace => (locale === undefined ? (key: string) => key : locale.bind(namespace)),
    storeOf: (candidate, sessionId) => storeSeat(candidate as RawEntry, sessionId),
    kitTap: (kit, _stored, owner) => {
      const keyboard = kit['keyboard'] as ComposerKeyboardLike | undefined
      if (keyboard === undefined || typeof keyboard.submit !== 'function') return kit
      const original = keyboard.submit.bind(keyboard)
      const submit = (mode: string, source?: string): void => {
        const text = draftText(keyboard.editor)
        if (text !== '') {
          const seat = owner.current
          const clear = (): void => {
            const actions = seat['inputActions'] as { setDraft?: (value: string) => void } | undefined
            actions?.setDraft?.('')
          }
          const claimed = ctx.bail('proton/composer-submit', {
            text,
            mode,
            source,
            sessionId: typeof seat['sessionId'] === 'string' ? seat['sessionId'] : undefined,
            clear,
          })
          if (claimed === true) return
        }
        original(mode, source)
      }
      // The shipped face is a live object (methods on its prototype and bound
      // state inside): a spread copy would drop every member that is not an own
      // enumerable field, and the composer calls several of them right after
      // mount. A proxy delegates everything, binding methods to the real face,
      // and overrides exactly one verb.
      const wrapped = new Proxy(keyboard as object, {
        get(target, property): unknown {
          if (property === 'submit') return submit
          const value = Reflect.get(target, property, target)
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value
        },
      }) as ComposerKeyboardLike
      return { ...kit, keyboard: wrapped }
    },
  }
}

export function apply(ctx: Context): void {
  const split = createSplitStore()
  ctx.effect(
    () => ctx.proton.connect([
      ...DIRECTORY_FLOW_SLOTS.map(slot => ({ slot, region: DIRECTORY_FLOW_REGION })),
      {
        slot: WORKSPACES_SLOT,
        region: WORKSPACES_REGION,
        // The shipped list declares locale/children/store, so the plain renderer
        // cannot draw it; the domain that contributed the region supplies the kit.
        render: (entry, owner) => ctx.proton.renderEntry(entry, owner),
        // The shipped list keeps the main pane; sections get a resizable bottom
        // pane (default half, never below 120px, never above 80%).
        split: { defaultRatio: 0.5, minPx: 120, maxRatio: 0.8 },
      },
    ], { split }),
    'proton-adapter-dsh: workspace outlets',
  )

  // The composer seat belongs to no domain and is taken on request only. A
  // composition that mounts this adapter for the workspace seats must keep the
  // shipped composer's own rendering; addSubmitTap() is the explicit ask, and
  // the seat leaves with the last disposer.
  const composerSources = composerKitSources(ctx)
  const composerSeat = createComposerSeat(() => ctx.proton.connect([{
    slot: COMPOSER_SLOT,
    region: COMPOSER_REGION,
    // No content of our own: the seat exists so the submit verb can ask other
    // plugins first. The shipped body renders through the entry face with its
    // kit untouched except for the submit verb.
    alwaysShadow: true,
    render: (entry, owner) => ctx.proton.entryFace(entry, {
      ...composerSources,
      owner,
      // Child slots of the composer (permission, plan, attachments, …) read the
      // root standard hooks; the seat carries them, so hand them down.
      standard: standardOf(owner),
      // The seat is session-scoped: its inject factory needs the id the host
      // renderer would pass. Without it the entry crashes on undefined.
      scope: { sessionId: currentSessionId() },
    }),
  }]))
  ctx.provide('protonComposer', {
    addSubmitTap: () => composerSeat.addSubmitTap(),
  })
  ctx.effect(() => () => composerSeat.dispose(), 'proton-adapter-dsh: composer seat')
}
