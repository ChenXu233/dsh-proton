import { expect, it, vi } from 'vitest'
import { MeshWorkspaceBridge } from '../src/client/bridge'

it('lists only remote workspaces with their owning node metadata', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    peers: [{
      nodeId: 'cloud', label: 'Cloud', status: 'online', assignedWorkspaceIds: [],
      workspaces: [{ workspaceId: 'ws-blog', name: 'blog', path: '/srv/blog', sessions: 2 }],
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const bridge = new MeshWorkspaceBridge(fetcher)
  expect(await bridge.listRemoteWorkspaces()).toEqual([{
    nodeId: 'cloud', nodeLabel: 'Cloud', workspaceId: 'ws-blog', title: 'blog', remotePath: '/srv/blog', status: 'online',
  }])
})

it('prepares a mesh anchor and returns its real local directory', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    ok: true, path: 'C:\\mesh\\anchors\\cloud\\blog',
    workspace: { workspaceId: 'local-anchor', path: 'C:\\mesh\\anchors\\cloud\\blog', title: 'blog @Cloud' },
  }), { status: 201, headers: { 'content-type': 'application/json' } }))
  const bridge = new MeshWorkspaceBridge(fetcher)
  const target = { nodeId: 'cloud', nodeLabel: 'Cloud', workspaceId: 'ws-blog', title: 'blog', remotePath: '/srv/blog', status: 'online' as const }
  await expect(bridge.prepareAnchor(target)).resolves.toEqual({
    path: 'C:\\mesh\\anchors\\cloud\\blog', title: 'blog @Cloud',
  })
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ nodeId: 'cloud', workspaceId: 'ws-blog' })
})

it('fails closed when mesh cannot prepare the anchor', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'unknown workspace' }), {
    status: 404, headers: { 'content-type': 'application/json' },
  }))
  const bridge = new MeshWorkspaceBridge(fetcher)
  await expect(bridge.prepareAnchor({ nodeId: 'cloud', workspaceId: 'missing' })).rejects.toThrow('unknown workspace')
})
