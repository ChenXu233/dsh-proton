import { expect, it, vi } from 'vitest'
import { WorkspaceSources } from '../src/client/sources'
import type { WorkspaceSource } from '../src/client/sources'

const source = (id: string, overrides: Partial<WorkspaceSource> = {}): WorkspaceSource => ({
  id,
  label: `label-${id}`,
  async list() { return [{ id: `${id}-w`, title: `repo-${id}`, status: 'online' as const }] },
  async adopt(candidate) { return { path: `/anchor/${id}/${candidate}` } },
  ...overrides,
})

it('registers sources once and disposes idempotently', () => {
  const sources = new WorkspaceSources()
  const off = sources.addSource(source('a'))
  expect(sources.list().map(entry => entry.id)).toEqual(['a'])
  expect(() => sources.addSource(source('a'))).toThrow(/already registered/)
  off()
  off()
  expect(sources.list()).toEqual([])
})

it('collects every source and isolates one failing source', async () => {
  const sources = new WorkspaceSources()
  sources.addSource(source('a'))
  sources.addSource(source('boom', { list: async () => { throw new Error('offline') } }))
  sources.addSource(source('b'))
  const result = await sources.collect()
  expect(result.rows.map(row => row.candidate.id).sort()).toEqual(['a-w', 'b-w'])
  expect(result.failures).toEqual([{ sourceId: 'boom', message: 'offline' }])
})

it('adopts through the source that offered the candidate', async () => {
  const sources = new WorkspaceSources()
  const adopt = vi.fn(async (id: string) => ({ path: `/anchor/${id}` }))
  sources.addSource(source('a', { adopt }))
  await expect(sources.adopt('a', 'w1')).resolves.toEqual({ path: '/anchor/w1' })
  expect(adopt).toHaveBeenCalledWith('w1')
  await expect(sources.adopt('missing', 'w1')).rejects.toThrow(/unknown workspace source/)
})

it('publishes source arrival and departure', () => {
  const sources = new WorkspaceSources()
  let changes = 0
  const unsubscribe = sources.subscribe(() => { changes += 1 })
  const off = sources.addSource(source('a'))
  expect(changes).toBe(1)
  off()
  expect(changes).toBe(2)
  unsubscribe()
})
