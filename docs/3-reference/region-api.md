> **状态**：已实施
> **日期**：2026-11-04
> **读者**：写下游插件的开发者
> **上游材料**：[原 Slot Winner 共存](../4-explanation/standalone-composition.md)
> **口径**：以 `packages/core/src/client/region.tsx`、`native.tsx`、`original.tsx` 的导出口径为准

# Proton Region API

`dsh-proton/client` 在 Cordis 里提供 `ctx.proton: RegionRegistry`。下游包声明 `inject = ['proton']`，在 `ctx.effect()` 中注册；注册函数返回幂等 disposer。

## Region

| Region | context | native adapter |
| --- | --- | --- |
| `workspace.directoryFlow` | `DirectoryFlowContext` | 有，接管 `sidebar.workspaces.directoryFlow` 与 `conversation.hero.workspace.directoryFlow` |
| `workspace.row` | `{ workspace: ProtonWorkspace }` | 无 |
| `workspace.actions` | `{}` | 无 |

只有 `workspace.directoryFlow` 有 adapter；其余两个目前只有类型，等对应的 seat/adapter 落地。

## 类型

```ts
interface ProtonWorkspace { workspaceId: string; path: string; title: string }

interface DirectoryFlowContext {
  open: boolean
  busy: boolean
  onPicked: (path: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

type RendererProps<K>     = { context: RegionContext<K> }
type ContributionProps<K> = RendererProps<K>
type DecoratorProps<K>    = RendererProps<K> & { next: () => ReactNode }
```

## 注册

```ts
ctx.proton.registerRenderer(name, { id, priority? }, component)   // priority 默认 0，小者获胜
ctx.proton.registerDecorator(name, { id, order? }, component)     // order 默认 0，小者在外层
ctx.proton.registerContribution(name, { id, order? }, component)  // order 默认 0，小者在前
```

- 三者都返回幂等 disposer；调用方负责在 `ctx.effect()` 里清理。
- `registerRenderer` 在同一 Region 用相同 priority 重复注册会抛错；不同 priority 合法，低者生效。
- `id` 用作 React key，同一 Region 内应唯一。
- 没有 Renderer 时渲染 Outlet 的 fallback；有 Renderer 时 fallback 不渲染。

## 读取

```ts
const snap = ctx.proton.snapshot('workspace.directoryFlow')
// { renderer?, decorators, contributions, occupied }

ctx.proton.getVersion()         // 版本号，供 useSyncExternalStore
ctx.proton.subscribe(listener)  // 返回取消订阅函数
```

`occupied` 为任一 Renderer / Decorator / Contribution 存在。native Outlet 只在 `occupied` 时向官方 slot 注册，最后一份内容卸载后撤离。

## 渲染顺序

`RegionHost` 产出：`Renderer ?? fallback` → 追加 Contributions（按 order）→ 用 Decorators 由内向外包裹（order 小者在外）。

## OriginalSlotEntry

```ts
OriginalSlotEntry({ entry, owner }: { entry: StoredEntry; owner: object }): ReactNode
```

复用官方 entry 的 `component` 与 `inject`：inject 结果按 entry identity 缓存（`WeakMap`），只执行一次；渲染时 injected props 在前、当前 owner props 在后（owner 冲突字段优先）。entry 按 identity 设 React key。

以下形态抛错，不降级：`children`、`store`、`locale`，以及 inject 结果里的 `hooks`、`keyedHooks`。错误信息带 registrant。
