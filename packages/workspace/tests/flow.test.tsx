// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DirectoryFlowContext } from 'dsh-proton-adapter-dsh/client'
import { WorkspaceFlow } from '../src/client/Flow'
import { WorkspaceSources } from '../src/client/sources'

afterEach(() => cleanup())

function setup() {
  const sources = new WorkspaceSources()
  const adopt = vi.fn(async (candidate: string) => ({ path: `/anchor/${candidate}` }))
  sources.addSource({
    id: 'fake',
    label: 'Fake cluster',
    async list() { return [{ id: 'w1', title: 'repo-one', detail: '/remote/one', status: 'online' as const }] },
    adopt,
  })
  const context: DirectoryFlowContext = {
    open: true, busy: false, onPicked: vi.fn(), onCancel: vi.fn(), onError: vi.fn(),
  }
  const next = vi.fn(() => <span>local-flow</span>)
  render(<WorkspaceFlow context={context} sources={sources} next={next} />)
  return { sources, adopt, context, next }
}

it('offers the local flow and every registered source', async () => {
  setup()
  expect(screen.getByRole('button', { name: '选择本机目录…' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '选择远端工作区…' }))
  await waitFor(() => expect(screen.getByText('repo-one')).toBeTruthy())
  expect(screen.getByText('/remote/one · Fake cluster')).toBeTruthy()
})

it('adopts the chosen candidate and hands the path to the shipped owner', async () => {
  const { adopt, context } = setup()
  fireEvent.click(screen.getByRole('button', { name: '选择远端工作区…' }))
  await waitFor(() => expect(screen.getByText('repo-one')).toBeTruthy())
  fireEvent.click(screen.getByText('repo-one'))
  await waitFor(() => expect(context.onPicked).toHaveBeenCalledWith('/anchor/w1'))
  expect(adopt).toHaveBeenCalledWith('w1')
})

it('renders the shipped flow when the operator picks the local branch', async () => {
  const { next } = setup()
  fireEvent.click(screen.getByRole('button', { name: '选择本机目录…' }))
  expect(screen.getByText('local-flow')).toBeTruthy()
  expect(next).toHaveBeenCalled()
})

it('reports cancellation without adopting anything', async () => {
  const { context, adopt } = setup()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(context.onCancel).toHaveBeenCalled()
  expect(adopt).not.toHaveBeenCalled()
})

it('surfaces a source failure without hiding the flow', async () => {
  const sources = new WorkspaceSources()
  sources.addSource({ id: 'dead', label: 'Dead', async list() { throw new Error('peer offline') }, async adopt() { return { path: '/x' } } })
  const context: DirectoryFlowContext = { open: true, busy: false, onPicked: vi.fn(), onCancel: vi.fn(), onError: vi.fn() }
  render(<WorkspaceFlow context={context} sources={sources} next={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: '选择远端工作区…' }))
  await waitFor(() => expect(context.onError).toHaveBeenCalledWith('peer offline'))
  expect(screen.getByRole('dialog')).toBeTruthy()
})