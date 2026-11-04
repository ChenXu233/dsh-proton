> **状态**：已实施
> **日期**：2026-11-04
> **读者**：改 remote workspace 分支的人
> **上游材料**：[原 Slot Winner 共存](../4-explanation/standalone-composition.md)
> **口径**：以 `packages/remote-workspace/src/client/bridge.ts` 为准；端点由 dsh-workspace-mesh 提供，本仓库只是调用方

# mesh 端点（本仓库消费的部分）

## `GET /api/mesh/state`

列远端工作区。请求带 `credentials: 'same-origin'` 与 `accept: application/json`。

```jsonc
{
  "peers": [
    {
      "nodeId": "peer-a",
      "label": "办公室 Mac",
      "status": "online",
      "workspaces": [
        { "workspaceId": "ws-1", "name": "proj", "path": "/Users/x/proj" }
      ]
    }
  ]
}
```

字段缺省时：`label` → `nodeId`，`name` → `workspaceId`，`path` → 空串，`status` → `unknown`。

`MeshWorkspaceBridge.listRemoteWorkspaces()` 把 peers × workspaces 摊平成：

```ts
interface MeshRemoteWorkspace {
  nodeId: string
  nodeLabel: string
  workspaceId: string
  title: string
  remotePath: string
  status: 'online' | 'offline' | 'unknown'
}
```

## `POST /api/mesh/anchor`

为远端工作区创建本地锚点。请求体 `{ nodeId, workspaceId }`。

```ts
{ ok: true, path: string, workspace: { path: string, title: string } }
```

`prepareAnchor()` 只取 `workspace.{path,title}`，忽略顶层 `path`。

## 错误

非 2xx 抛 `Error`：优先用响应体里的 `error` 字段，否则 `HTTP <status>`。响应体不是 JSON 时按无 body 处理。

本地锚点不是远端挂载，agent loop 始终在归属机。这里没有 abort 支持：晚到的回调由调用方（Decorator）用 active 标记与 ticket 守卫抑制。
