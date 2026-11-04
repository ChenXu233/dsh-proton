export interface MeshRemoteWorkspace {
  nodeId: string
  nodeLabel: string
  workspaceId: string
  title: string
  remotePath: string
  status: 'online' | 'offline' | 'unknown'
}

export interface MeshAnchor {
  path: string
  title: string
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

async function request<T>(fetcher: Fetcher, path: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(path, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...init,
  })
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'error' in value
      ? String(value.error)
      : `HTTP ${response.status}`
    throw new Error(message)
  }
  return value as T
}

/** Client of dsh-workspace-mesh's own metadata and anchor routes. */
export class MeshWorkspaceBridge {
  constructor(private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {}

  async listRemoteWorkspaces(): Promise<MeshRemoteWorkspace[]> {
    const payload = await request<{ peers?: Array<{
      nodeId: string
      label?: string
      status?: 'online' | 'offline' | 'unknown'
      workspaces?: Array<{ workspaceId: string; name?: string; path?: string }>
    }> }>(this.fetcher, '/api/mesh/state')
    return (payload.peers ?? []).flatMap(peer => (peer.workspaces ?? []).map(workspace => ({
      nodeId: peer.nodeId,
      nodeLabel: peer.label || peer.nodeId,
      workspaceId: workspace.workspaceId,
      title: workspace.name || workspace.workspaceId,
      remotePath: workspace.path ?? '',
      status: peer.status ?? 'unknown',
    })))
  }

  async prepareAnchor(target: Pick<MeshRemoteWorkspace, 'nodeId' | 'workspaceId'>): Promise<MeshAnchor> {
    const anchor = await request<{ ok: true; path: string; workspace: MeshAnchor }>(this.fetcher, '/api/mesh/anchor', {
      method: 'POST',
      body: JSON.stringify({ nodeId: target.nodeId, workspaceId: target.workspaceId }),
    })
    return { path: anchor.workspace.path, title: anchor.workspace.title }
  }
}
