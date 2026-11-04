// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RemoteWorkspaceFlow } from '../src/client/RemoteWorkspaceFlow'
import type { MeshRemoteWorkspace, MeshWorkspaceBridge } from '../src/client/bridge'

afterEach(() => cleanup())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function contextFixture() {
  return {
    open: true, busy: false,
    onPicked: vi.fn(), onCancel: vi.fn(), onError: vi.fn(),
  }
}

function bridgeFixture(rows: MeshRemoteWorkspace[] = [], prepareAnchor = vi.fn()) {
  return {
    listRemoteWorkspaces: vi.fn().mockResolvedValue(rows),
    prepareAnchor,
  } as unknown as MeshWorkspaceBridge
}

const row: MeshRemoteWorkspace = {
  nodeId: 'cloud', nodeLabel: 'Cloud', workspaceId: 'ws-blog', title: 'blog', remotePath: '/srv/blog', status: 'online',
}

it('does not start the original flow until local is chosen, then renders next', () => {
  const context = contextFixture()
  const next = vi.fn(() => <div>original directory flow</div>)
  const bridge = bridgeFixture([row])
  render(<RemoteWorkspaceFlow context={context} bridge={bridge} next={next} />)
  expect(next).not.toHaveBeenCalled()
  expect(bridge.listRemoteWorkspaces).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '选择本机目录…' }))
  expect(next).toHaveBeenCalled()
  expect(screen.getByText('original directory flow')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '选择远端工作区…' })).toBeNull()
  expect(bridge.listRemoteWorkspaces).not.toHaveBeenCalled()
})

it('permits only one remote adoption and invalidates a late anchor after cancel', async () => {
  const pending = deferred<{ path: string; title: string }>()
  const prepareAnchor = vi.fn(() => pending.promise)
  const context = contextFixture()
  render(<RemoteWorkspaceFlow context={context} bridge={bridgeFixture([row], prepareAnchor)} next={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: '选择远端工作区…' }))
  const remote = await screen.findByRole('button', { name: /blog @Cloud/ })
  fireEvent.click(remote)
  fireEvent.click(remote)
  expect(prepareAnchor).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(context.onCancel).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve({ path: '/late/anchor', title: 'blog @Cloud' })
    await pending.promise
  })
  expect(context.onPicked).not.toHaveBeenCalled()
})

it('reports remote adoption failure through the official onError surface', async () => {
  const prepareAnchor = vi.fn().mockRejectedValue(new Error('node offline'))
  const context = contextFixture()
  render(<RemoteWorkspaceFlow context={context} bridge={bridgeFixture([row], prepareAnchor)} next={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: '选择远端工作区…' }))
  fireEvent.click(await screen.findByRole('button', { name: /blog @Cloud/ }))
  await waitFor(() => expect(context.onError).toHaveBeenCalledWith('node offline'))
  expect(context.onPicked).not.toHaveBeenCalled()
})

it('invalidates a late remote result after the decorator unmounts', async () => {
  const pending = deferred<{ path: string; title: string }>()
  const context = contextFixture()
  const view = render(<RemoteWorkspaceFlow
    context={context}
    bridge={bridgeFixture([row], vi.fn(() => pending.promise))}
    next={() => null}
  />)
  fireEvent.click(screen.getByRole('button', { name: '选择远端工作区…' }))
  fireEvent.click(await screen.findByRole('button', { name: /blog @Cloud/ }))
  view.unmount()
  await act(async () => { pending.resolve({ path: '/late/unmounted', title: 'late' }); await pending.promise })
  expect(context.onPicked).not.toHaveBeenCalled()
})

it('moves focus into the chooser, handles document Escape and restores prior focus', async () => {
  const outside = document.createElement('button')
  document.body.appendChild(outside)
  outside.focus()
  const context = contextFixture()
  const view = render(<RemoteWorkspaceFlow context={context} bridge={bridgeFixture()} next={() => null} />)
  const dialog = screen.getByRole('dialog')
  await waitFor(() => expect(document.activeElement).toBe(dialog))
  const local = screen.getByRole('button', { name: '选择本机目录…' })
  const cancel = screen.getByRole('button', { name: '取消' })
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(document.activeElement).toBe(local)
  cancel.focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(document.activeElement).toBe(local)
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(cancel)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(context.onCancel).toHaveBeenCalledTimes(1)
  view.rerender(<RemoteWorkspaceFlow context={{ ...context, open: false }} bridge={bridgeFixture()} next={() => null} />)
  expect(document.activeElement).toBe(outside)
  outside.remove()
})
