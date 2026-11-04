# 质子（dsh-proton）

> 当前状态：通用组合层已拆分完成；自动测试、类型检查与构建是验收边界，尚未安装到运行中的 DSH 做人工验收。
> 日期：2026-11-04

质子是 DSH 的**通用 UI 组合层**。它只知道 Region、Renderer、Decorator、Contribution 四件事 —— 不知道工作区、不知道会话、不知道远端。产品语义由各自的域包实现，backend 细节由各自的适配包实现。

## 依赖方向

```text
                      <backend 适配包，例如 mesh 侧的>
                                │  addSource()
                      dsh-proton-workspace           ← 工作区域（添加流程）
                                │  registerDecorator()
                      dsh-proton-adapter-dsh         ← 官方 slot key 与 owner 契约
                                │  ctx.proton.connect()
                      dsh-proton                     ← 组合机制，零产品语义
```

箭头只朝下：core 不依赖任何域，域不依赖任何 backend，backend 适配包不 import backend 的代码。

## 包

| 包 | 职责 | 必需 |
| --- | --- | --- |
| `dsh-proton` | Region / Renderer / Decorator / Contribution + outlet 接线；零产品语义 | 是 |
| `dsh-proton-adapter-dsh` | 唯一知道官方 slot key 与 owner props 契约的一层 | 是 |
| `dsh-proton-workspace` | 工作区域：把「添加工作区」装饰成「本机 / 已注册来源」 | 是 |

## 两个注册点，别混

- `ctx.proton` —— **组合**注册：`registerRenderer` / `registerDecorator` / `registerContribution` / `connect`。这是域包对自己 UI 的编排。
- `ctx.protonWorkspace` —— **来源**注册：`addSource({ id, label, list(), adopt(id) })`。这是 backend 适配包接入的唯一入口，属于工作区域自己的服务，**不经过 core**。

core 里没有 `addSource`，也没有 `workspace` 这个词。

## 原 winner 共存

```text
官方 single slot → Proton Outlet → Decorators → next() → 原官方 Renderer + Contributions
```

- Proton 占用官方 slot 后，从 `ctx.slots.entries()` 排除自己的 Outlet，找到原 winner。
- 原 winner 的 Component 与 plain inject 被保留并重新渲染；inject 按 entry 缓存，owner props 使用当前值。
- 原 entry 不卸载、不迁移，仍由官方 registry 与 Cordis 管理生命周期。
- 最后一份 Proton 内容卸载后，Outlet 撤离，官方 occupant 自然恢复。

## 明确的支持边界

OriginalSlotEntry 目前只支持 root scope、plain inject、且没有 children / store / locale / hooks / keyedHooks 声明的 entry（即 shipped 的 native 与 browse directory-flow 形态）。遇到其他形态会明确报错，不代表质子已能包装任意官方组件。

Outlet 采用接管时的 live winner 与接管后新注册的 entry，并通过 `onEntryError` 排除随后被官方 abdicate 的 entry。公开 API 无法查询接管前已 shadowed 的 entry 是否曾崩溃，因此这些历史 fallback 不会被自动采用。

## 构建与验证

```sh
pnpm install
pnpm test          # core 14 + workspace 11
pnpm typecheck
pnpm build
node --check packages/core/lib/client.js
node --check packages/adapter-dsh/lib/client.js
node --check packages/workspace/lib/client.js
```

## 联调前置

1. 使用 DSH `0.2.1-rc.5` 类型基线构建；部署机需先升到该版本，否则 `dsh.engines` 会拒绝安装。
2. 挂载 `dsh-proton` 与 `dsh-proton-adapter-dsh`。
3. 需要远端来源时，挂上对应 backend 自己的适配包（例如 `dsh-workspace-mesh` 内置的质子来源），并保证该 backend 提供自己的锚点与列表接口。
4. 真实窗口里的点击、焦点、HMR 与卸载仍需人工验收。
