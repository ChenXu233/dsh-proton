> **状态**：accepted（决策）· 已实施（单测与构建通过，运行中 DSH 的人工验收未做）
> **日期**：2026-11-04
> **读者**：维护组合层的人与 agent
> **范围**：只改本仓库 `packages/*`，不修改 DSH 上游
> **权威**：结构与支持边界的唯一出处；README 与各包 README 都指回这里

# 原 Slot Winner 共存

## 问题

官方 single slot 只有一个 winner。Proton 想在同一个位置插入自己的 UI（本机/远端选择、mesh 列表），有两条省事的路：复刻官方组件——上游改样式或行为就漂移；或要求上游提供 `renderDefault()`——但改不了上游。

本设计走第三条路：**占用 slot，然后把占用前的原 winner 请回自己的树里正常渲染**。不复制组件，不搬运 DOM，也不接管原注册的生命周期。

## 目标结构

```mermaid
flowchart LR
    slot["官方 single slot"] --> outlet["Proton Outlet"]
    outlet --> dec["Decorator"]
    dec -->|next()| body["原官方 Renderer<br/>+ Proton Contribution(s)"]
```

## 核心方案

1. Proton 通过 `ctx.slots.entries(name)` 读注册记录，**排除自己的 Outlet**，得到原 winner。
2. 原 winner 的 `component` 与 `inject` 原样复用：按 entry identity 缓存并执行原 inject factory，把 injected props 与**当前** owner props 一起交给原 Component（owner 冲突字段优先）。
3. 原 entry 不卸载、不迁移，仍由官方 registry 与 Cordis 管理生命周期。Proton 只渲染它，不 dispose 它。
4. `RegionHost` 把原 entry 作为默认内容；Renderer 可替换默认内容，Contribution 追加内容，Decorator 决定是否以及何时调用 `next()`。
5. Outlet 订阅官方 slot 版本：原 winner 替换时跟随更新；Proton 最后一份内容卸载后 Outlet 撤离，官方 occupant 自然恢复。

## Region 协议

- **Renderer**：提供 Region 的默认内容，priority 小者获胜；与 Outlet 的 fallback（原 entry）互斥，有 Renderer 时 fallback 不渲染。
- **Decorator**：`next()` 返回其内层内容；多个 Decorator 按 order 组合，order 小者在外层。
- **Contribution**：以独立 id 追加在 Renderer/fallback 之后，按 order 排列。
- **occupied**：任一 Renderer / Decorator / Contribution 存在即为 true；native Outlet 只在 occupied 时注册，最后一份内容卸载后撤离。
- 所有注册返回幂等 disposer，调用方应放进自己的 `ctx.effect()`。

## 支持边界（唯一出处）

`OriginalSlotEntry` 只接受官方 native/browse directory-flow 的实际 entry 形态：

- root scope、plain inject；
- 无 `children`、`store`、`locale`、`hooks`、`keyedHooks` 声明。

其他形态**必须明确报错**（错误信息带 registrant），不能降级冒充。公开 API 拿不到完整的私有渲染上下文，所以「Proton 能自动包装任意官方组件」是不成立的承诺。

Outlet 采用接管时的 live winner 与接管后新注册的 entry；随后被官方 abdicate 的 entry 通过 `onEntryError` 排除。接管前已 shadowed 的历史 fallback 因公开 API 无法查询历史 abdication 而**不采用**：初始 winner 消失且无新 entry 时，Proton 选择空 fallback，而不是冒险复活已退役组件。

## 已知锐边

改这块代码前先看。每条都是会**静默出错**的失败模式，不是理论风险：

| 锐边 | 出错时的表现 | 对策 |
| --- | --- | --- |
| Outlet 自己也在 `entries()` 里 | 递归渲染自己 | 按 component 身份排除自身 |
| `inject` 每次 render 可能返回新值 | 每次渲染都重启原 native flow | 按 entry identity 缓存 inject |
| 原 entry 被卸载或替换 | 继续渲染已退役组件 | 跟随 slot version 更新，并用 `onEntryError` 排除 abdicated entry |
| 初次打开就调 `next()` | 官方 native picker 抢走本机/远端选择 | 用户明确选择本机前不调 `next()` |
| 远端 Promise 在取消或卸载后完成 | 对已关闭的流程调用 `onPicked` | active 标记 + ticket 守卫，晚到回调本地抑制 |
| 注入缓存与 React state 只在 Proton 持有 Outlet 期间成立 | 接管与恢复边界会 remount 官方组件，其瞬时状态可能重置 | 作为已知限制接受：不承诺状态连续 |

## 工作区域

`dsh-proton-workspace` 只注册 `workspace.directoryFlow` Decorator，不注册替代 Renderer：

- 初次打开显示「本机 / 已注册来源」选择。
- 选本机 → 调用 `next()`，原生 OS picker 或官方 browse dialog 由原 entry 自己运行。
- 选来源 → 不调 `next()`，Decorator 渲染该来源给出的候选；选中后调 `source.adopt(id)` 换到本地路径，再交回官方 `onPicked(path)`。
- 关闭、取消、错误与最终 `onPicked` 仍使用官方 owner conversation。

来源由 backend 自己的适配包通过 `ctx.protonWorkspace.addSource()` 注册。本仓库不知道任何具体 backend，也不知道它会调哪些 HTTP —— 那是适配包与 backend 契约之间的事。

## 非目标

- 不修改或 monkey patch 上游，不读 React internals，不搬 DOM。
- 不自动支持所有官方 slot entry 形态（见「支持边界」）。
- 不接管 `sidebar.workspaces`；真要接管时另建 `dsh-proton-workspace-seat` 并由域包调用，本仓库不提前建空壳。
- 不修改 `dsh-workspace-mesh` 的 Host API，不实现 VS Code 布局。
- 本地锚点不是远端挂载：agent loop 始终在归属机。
- 不为 mesh 请求增加网络 abort（mesh API 改动超出范围）：晚到的 owner 回调在本地抑制。

## 验收

自动判据，在仓库根执行，全部退出码 0：

```sh
pnpm test
pnpm typecheck
pnpm build
node --check packages/core/lib/client.js
node --check packages/adapter-dsh/lib/client.js
node --check packages/workspace/lib/client.js
```

覆盖的行为：

- 渲染的是原 Component，并收到缓存的 inject 与最新 owner props；重复渲染不重复执行 inject。
- children / store / locale / hooks / keyedHooks 形态抛出带「不支持」语义的错误。
- Outlet 排除自身，跟随 winner 更新，卸载后两个官方席位都恢复。
- Decorator 未选本机时原 Component 不运行；选本机后经 `next()` 运行。
- 远端分支的单操作、取消/卸载失效、焦点与错误行为。

未覆盖（不得据此声称验收通过）：

- 真实窗口中的点击、焦点、HMR 与卸载。
- mesh 列表与锚点 Promise 的晚到拒绝路径；现有 active/ticket 守卫未变。
