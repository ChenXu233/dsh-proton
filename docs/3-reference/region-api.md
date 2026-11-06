> **状态**：已实施
> **日期**：2026-11-04
> **读者**：写下游插件的开发者
> **上游材料**：[原 Slot Winner 共存](../4-explanation/standalone-composition.md)
> **口径**：以 `packages/core/src/client/{index.ts,region.tsx,slot.tsx,original.tsx}` 与 `packages/adapter-dsh/src/client/index.tsx` 的导出口径为准

# Proton Region API

`dsh-proton/client` 在 Cordis 里提供 `ctx.proton: ProtonRegistry`（`RegionRegistry` 的子类，多一个 `connect()`）。下游包声明 `inject = ['proton']`，在 `ctx.effect()` 中注册；注册函数返回幂等 disposer。

## Region 词汇是空的

`ProtonRegionMap` 在 core 里是**空的可合并接口**：core 不认识任何 region 名。域包在自己的 client 入口用声明合并补进来，与 DSH 的 `SlotMap` 同一套做法：

```ts
declare module 'dsh-proton/client' {
  interface ProtonRegionMap {
    'workspace.directoryFlow': { context: DirectoryFlowContext }
  }
}
```

当前三个 region：两个由 `dsh-proton-adapter-dsh` 声明，一个由工作区域包声明：

| Region | context | 谁声明 | 谁接官方槽 |
| --- | --- | --- | --- |
| `workspace.list` | `Record<string, unknown>`（owner props） | `dsh-proton-adapter-dsh` | 是：`sidebar.workspaces`（含子槽 `directoryFlow`） |
| `workspace.directoryFlow` | `DirectoryFlowContext` | `dsh-proton-adapter-dsh` | 是：`sidebar.workspaces.directoryFlow` 与 `conversation.hero.workspace.directoryFlow` |
| `hero.workspace` | `Record<string, unknown>`（owner props） | `dsh-proton-workspace` | 是：`conversation.hero.workspace`（只换 kit，不换组件） |

官方槽位与 `DirectoryFlowContext` 都只出现在适配包里；域包通过 `registerDecorator` 参与，不 import `ui-workspace`。

## 类型

```ts
type RegionContext<K>     = ProtonRegionMap[K] extends { context: infer C } ? C : never
type RendererProps<K>     = { context: RegionContext<K> }
type ContributionProps<K> = RendererProps<K>
type DecoratorProps<K>    = RendererProps<K> & { next: () => ReactNode }

interface SlotOutlet<K> {
  slot: string      // 官方 slot key，core 只当成字符串
  region: K
  priority?: number // 默认 -100，压过 shipped occupant
  alwaysShadow?: boolean // 默认 false：只在 region 有内容时占座；true 表示没有 contribution 也要占
  render?: (entry, owner) => ReactNode  // 合成 kit 后画官方 entry；省略时按原样渲染
  split?: { defaultRatio?: number; minPx?: number; maxRatio?: number }  // 官方占主栏，contributions 进可拖拽的下栏
}
```

## 注册

```ts
ctx.proton.registerRenderer(name, { id, priority? }, component)   // priority 默认 0，小者获胜
ctx.proton.registerDecorator(name, { id, order? }, component)     // order 默认 0，小者在外层
ctx.proton.registerContribution(name, { id, order? }, component)  // order 默认 0，小者在前
ctx.proton.connect(outlets)                                       // 适配/域包用：把官方 winner 包进 region
```

- 前三者都返回幂等 disposer；调用方负责在 `ctx.effect()` 里清理。
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

`occupied` 为任一 Renderer / Decorator / Contribution 存在。`connect()` 出来的 Outlet 只在 `occupied` 时向官方 slot 注册，最后一份内容卸载后撤离，官方 occupant 自然恢复。

`alwaysShadow: true` 的座位不看 `occupied`：它要的是“同一个 entry、换一套 kit”，本来就没有额外内容。这种座位必须保证 entry 有 provider 认领（见下一节），否则会落到 `OriginalSlotEntry` 的抛错分支。

## Entry kit 与 picker 座位

`ctx.proton.addEntrySources(provider)` 让域包认领 entry 并描述主机会怎么合成它的 props。工作区域包用这条给 **hero 的 workspace picker** 换 kit：`open` / `onPick` / `anchorRef` 由座位（owner）逐次传入，`useWorkspaces` / `t` / `renderSlot` 由域包提供。

两条容易踩的约束：

- **owner props 逐次渲染，不缓存**。`EntryFace` 只 memo 住 kit（translator、hook、store、slot face）；`owner` 里的 `open`、当前选中这类每次渲染都会变，缓存住会把组件冻在第一次渲染。
- **标准 prop 会被 owner 覆盖**。slot 渲染器把 root 标准 props 一并交给座位，所以座位上也有 `useWorkspaces`；域包要让自己的合成分支生效，就得在 owner 里摘掉同名键。

工作区域包对 picker 暴露的扩展点是 `ctx.protonWorkspace.addPickerExtras({ rows, pick, selectedId? })`：`rows` 是 observable，`pick` 返回 true 表示这一行不是本机 Workspace（不建 Session）。没有注册时 picker 与官方完全一致。

## 渲染顺序

`RegionHost` 产出：`Renderer ?? fallback` → 追加 Contributions（按 order）→ 用 Decorators 由内向外包裹（order 小者在外）。

## OriginalSlotEntry

```ts
OriginalSlotEntry({ entry, owner }: { entry: StoredEntry; owner: object }): ReactNode
```

复用官方 entry 的 `component` 与 `inject`：inject 结果按 entry identity 缓存（`WeakMap`），只执行一次；渲染时 injected props 在前、当前 owner props 在后（owner 冲突字段优先）。entry 按 identity 设 React key。

以下形态抛错，不降级：`children`、`store`、`locale`，以及 inject 结果里的 `hooks`、`keyedHooks`。错误信息带 registrant。

## 分栏（split）

`connect(outlets, { split })` 传入一个持久化的比例 store；outlet 声明 `split` 后，座位渲染成：

```text
┌──────────────────────────────┐
│ 主栏：官方 entry（flex:1）     │
├──────────────────────────────┤  ← 6px 分隔条，role=separator，可拖、可键盘
│ 下栏：region contributions     │
└──────────────────────────────┘
```

- 只在下栏**有内容**时才分栏：没有 contribution 时官方占满整列。
- 比例存在主机的 client store 里（`defineStore` + `persist`），与官方视图状态同一个引擎，不自己发明键格式。
- 默认 0.5；下限由 `minPx`（默认 120px）换算，上限 `maxRatio`（默认 0.8）。拖拽期间只更新本地状态，松手才写一次 store。
- `SplitStore` 由调用方提供：core 不 import 主机的 store 包，adapter 负责把 DSH 的引擎接进来。
