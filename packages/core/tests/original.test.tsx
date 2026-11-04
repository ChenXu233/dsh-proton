import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { OriginalSlotEntry } from '../src/client/original'

it('renders the original component with cached inject and current owner props', () => {
  const inject = vi.fn(() => ({ fromInject: 'original', label: 'inject' }))
  const entry = {
    component: ({ fromInject, label, open }: { fromInject: string; label: string; open: boolean }) => (
      <span>{fromInject}:{label}:{String(open)}</span>
    ),
    inject,
  } as unknown as StoredEntry
  const render = (open: boolean) => renderToStaticMarkup(
    <OriginalSlotEntry entry={entry} owner={{ label: 'owner', open }} />,
  )
  expect(render(false)).toContain('original:owner:false')
  expect(render(true)).toContain('original:owner:true')
  expect(inject).toHaveBeenCalledTimes(1)
})

it.each([
  ['children', { children: { child: { kind: 'single', scope: 'root' } } }],
  ['store', { store: { create: () => ({}) } }],
  ['locale', { locale: 'workspace' }],
  ['hooks', { inject: () => ({ hooks: { value: {} } }) }],
  ['keyedHooks', { inject: () => ({ keyedHooks: { value: () => undefined } }) }],
])('rejects unsupported original entry shape: %s', (_name, patch) => {
  const entry = { component: () => null, ...patch } as unknown as StoredEntry
  expect(() => renderToStaticMarkup(<OriginalSlotEntry entry={entry} owner={{}} />)).toThrow(/不支持|unsupported/i)
})
