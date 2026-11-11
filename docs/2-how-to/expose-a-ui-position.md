> **状态**：已实施
> **日期**：2026-11-04
> **读者**：要给某个 UI 位置开接入点的插件作者
> **上游材料**：[Proton Region API](../3-reference/region-api.md) · [原 Slot Winner 共存](../4-explanation/standalone-composition.md)
> **口径**：示例与字段取自 `packages/adapter-dsh`、`packages/workspace` 与 `packages/core/src/client/region.tsx`

# 给一个 UI 位置提供接入点

一个 Region 表示一个可以被多方填充的 UI 位置。你声明 Region，其他插件向它注册内容。

先判断这个位置有没有官方实现：

| 情况 | 做法 |
| --- | --- |
| 官方已有 single slot | 声明 Region，用 `ctx.proton.connect()` 接住原实现。质子渲染 Host。 |
| 全新位置 | 声明 Region，在你的组件里渲染 `<RegionHost>`。 |

两种情况都从步骤 1 开始。

## 步骤 1：声明 Region

在包的 client 入口声明 Region 名与 context：

```ts
import type {} from 'dsh-proton/client'

export interface TodoPanelContext {
  projectId: string
  onClose: () => void
}

declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    'todo.panel': { context: TodoPanelContext }
  }
}
```

规则：

- Region 名用 `<域>.<位置>`。一个名字只由一个包声明。
- context 是这个位置交给内容的 props。只放内容需要的字段。
- 声明必须放在会被编译进 client 入口的文件里。放错文件时，注册处看不到这个 Region 名。

步骤 1 不产生运行时行为。它只让 TypeScript 认识这个 Region 名。

## 步骤 2：接住官方实现（仅当位置已有官方 slot）

```ts
export const inject = ['slots', 'proton'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.proton.connect([{ slot: 'sidebar.todo', region: 'todo.panel' }]),
    'todo-panel: outlet',
  )
}
```

`connect()` 做三件事：

1. Region 有内容时，向官方 slot 注册一个 outlet。Region 没有内容时不注册，官方实现照常显示。
2. outlet 渲染 `RegionHost`，并把官方原实现作为 fallback 接住。
3. 最后一份内容卸载后，outlet 撤离，官方实现恢复。

要点：

- `slot` 是官方 slot key。质子只把它当字符串用。示例里的 `sidebar.todo` 是占位名，换成你目标位置的真实 key。
- `priority` 默认 `-100`，低于官方 occupant，outlet 因此能接管。不要随手改成正值。
- 官方原实现由 `OriginalSlotEntry` 渲染。它只支持 native/browse directory-flow 那一类 entry，其他形态会抛错。边界见[设计文档](../4-explanation/standalone-composition.md)。

## 契约从质子导入，不重声明

slot key、owner props 与服务接口都由质子导出。域包消费时用 `import type`，不要本地抄一份：

```ts
import type {} from 'dsh-proton-adapter-dsh/client'          // 事件与 protonComposer
import type { WorkspaceServices } from 'dsh-proton-workspace/client'
```

`import type` 构建时被擦除，不产生运行时依赖；但它让契约漂移变成编译错误。本地重声明会切断这道检查，只在运行时暴露。

## 步骤 3：渲染 Host（仅当位置是全新的）

位置没有官方 slot 时，你在自己的组件里渲染 Host：

```tsx
import { RegionHost } from 'dsh-proton/client'
import type { RegionRegistry } from 'dsh-proton/client'

export function TodoPanel(props: {
  registry: RegionRegistry
  projectId: string
  onClose: () => void
}) {
  return (
    <RegionHost
      registry={props.registry}
      name="todo.panel"
      context={{ projectId: props.projectId, onClose: props.onClose }}
      fallback={<p>还没有内容</p>}
    />
  )
}
```

要点：

- `registry` 由挂载这个组件的代码传入，通常是 `ctx.proton`。
- `context` 每次渲染可以是新对象。`RegionHost` 把它传给 Region 里的每个内容。
- `fallback` 在没有 Renderer 时显示。
- 先把组件挂到 DSH 的目标位置。挂载这一步属于 DSH 插件，不属于质子。

## 步骤 4：给默认内容（可选）

```tsx
ctx.effect(
  () => ctx.proton.registerRenderer('todo.panel', { id: 'todo.panel.base' }, ({ context }) => (
    <ul data-project={context.projectId} />
  )),
  'todo-panel: base renderer',
)
```

- 一个 Region 只有一个生效的 Renderer，priority 最小者生效。
- 同一 Region 用相同 priority 注册第二个 Renderer 会抛错。
- 想替换别人的 Renderer，用更小的 priority。不要直接调用别人的组件。

## 步骤 5：让别人填内容

三种角色：

| 角色 | 用途 | props |
| --- | --- | --- |
| Renderer | 提供默认内容 | `context` |
| Decorator | 包裹或延后渲染内层 | `context`、`next()` |
| Contribution | 在默认内容之后追加 | `context` |

Decorator：

```tsx
ctx.proton.registerDecorator('todo.panel', { id: 'acme.frame', order: 10 }, ({ next }) => (
  <div className="acme-frame">{next()}</div>
))
```

- 不调用 `next()`，内层就不渲染。
- order 小的在外层。

Contribution：

```tsx
ctx.proton.registerContribution('todo.panel', { id: 'acme.count', order: 0 }, ({ context }) => (
  <span>{context.projectId}</span>
))
```

- 三个注册都返回幂等 disposer。把注册放进 `ctx.effect()`，由 Cordis 清理。
- `id` 用作 React key。同一 Region 内必须唯一。

## 步骤 6：验证

每个 Region 至少测三条：

1. 注册内容后，Host 渲染出它，并收到最新的 context。
2. 内容卸载后，Region 回到 fallback。接了官方 slot 时，官方实现恢复。
3. 同一 priority 注册第二个 Renderer 会抛错。

```sh
pnpm --filter <包名> test
pnpm --filter <包名> typecheck
```

写法参考 `packages/core/tests/region.test.tsx`。

## 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `ctx.proton` 是 undefined | 没写 `inject = ['proton']` | 补上 inject，确认 `dsh-proton` 已挂载 |
| 官方界面变成空白 | Decorator 没调用 `next()` | 在合适的位置调用 `next()` |
| 抛 `already has a renderer at priority 0` | 两个 Renderer 用了同一 priority | 改其中一个的 priority，小的生效 |
| 卸载后界面不恢复 | 注册没交给 `ctx.effect()` | 用 `ctx.effect()` 包住注册 |
| 类型报 Region 名不存在 | 声明没被引入，或不在 client 入口 | 加 `import type {} from 'dsh-proton/client'`，把声明放进编译入口 |

## 完整示例

```tsx
// packages/todo-panel/src/client/index.tsx
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-proton/client'

export interface TodoPanelContext {
  projectId: string
  onClose: () => void
}

declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    'todo.panel': { context: TodoPanelContext }
  }
}

export const inject = ['slots', 'proton'] as const

export function apply(ctx: Context): void {
  // 位置已有官方 slot：接管它，并接住原实现
  ctx.effect(
    () => ctx.proton.connect([{ slot: 'sidebar.todo', region: 'todo.panel' }]),
    'todo-panel: outlet',
  )

  // 可选：给没有其他内容时一个默认 Renderer
  ctx.effect(
    () => ctx.proton.registerRenderer('todo.panel', { id: 'todo.panel.base' }, ({ context }) => (
      <ul data-project={context.projectId} />
    )),
    'todo-panel: base renderer',
  )
}
```

字段、错误与读取接口见 [Proton Region API](../3-reference/region-api.md)。为什么这样设计见[原 Slot Winner 共存](../4-explanation/standalone-composition.md)。
