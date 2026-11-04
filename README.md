# 质子（dsh-proton）

DSH 的 UI 组合层。它在官方已有的 UI 位置上叠加自己的内容，原有实现继续渲染。

官方 single slot 只能有一个实现。质子占用 slot 后，把占用前的原实现接回自己的渲染树。质子不复制该实现，也不修改上游。插件只声明自己在某个 Region 里放什么。插件不接触 DOM，不读 React 内部，不 monkey patch 官方插件。

## 它做什么

- **保留原实现**：官方 slot 被占用后，占用前的原实现继续渲染。质子不迁移、不销毁原 entry，注册与生命周期仍由官方 registry 管理。
- **组合一个 Region**：一个 Region 可以同时有 Renderer、Decorator 和 Contribution。Renderer 提供默认内容。Decorator 包裹或延后渲染，用 `next()` 决定原实现是否渲染。Contribution 追加内容。
- **撤离**：卸载最后一份质子内容后，Outlet 退出，官方实现恢复，不需要重启。

## 依赖方向

```text
backend 的来源适配包
        │ addSource()
dsh-proton-workspace      工作区域：目录流的「本机 / 已注册来源」
        │ registerDecorator()
dsh-proton-adapter-dsh    官方 slot key 与 owner props 契约
        │ ctx.proton.connect()
dsh-proton                组合机制
```

依赖只朝下。上层依赖下层，下层不反向引用。

## 包

| 包 | 职责 |
| --- | --- |
| `dsh-proton` | Region、Renderer、Decorator、Contribution 与 outlet 接线 |
| `dsh-proton-adapter-dsh` | 官方 slot key、owner props 契约与类型再导出 |
| `dsh-proton-workspace` | 工作区域：把「添加工作区」做成「本机 / 已注册来源」两条路 |

## 两个注册入口

- `ctx.proton`：组合注册。使用 `registerRenderer`、`registerDecorator`、`registerContribution` 或 `connect`。
- `ctx.protonWorkspace`：来源注册。使用 `addSource({ id, label, list(), adopt(id) })`，由 `dsh-proton-workspace` 提供。

## 快速开始

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## 联调

挂载步骤、人工验收清单与排错见[接入 DSH 联调](docs/2-how-to/integrate-with-dsh.md)。自动测试、类型检查与构建已通过。尚未在运行中的 DSH 做人工验收。

## 文档

- [docs/README.md](docs/README.md)：文档导航与写作约定。
- [AGENTS.md](AGENTS.md)：仓库规则与事实归属。
- 包 README：[core](packages/core/README.md)、[adapter-dsh](packages/adapter-dsh/README.md)、[workspace](packages/workspace/README.md)。

## 许可证

Apache-2.0。全文见 [LICENSE](LICENSE)。
