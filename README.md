# 质子（dsh-proton）

DSH 的通用 UI 组合层。下游插件向 Region 注册 Renderer、Decorator 或 Contribution，不操作 DOM、不读取 React 内部，也不 monkey patch 官方插件。

## 状态

PoC 已实现，单测、类型检查与构建通过；**尚未安装到运行中的 DSH 做人工验收**，详见文末「未核实」。

## 结构

```text
官方 single slot → Proton Outlet → Decorator → next() → 原官方 Renderer + Contribution
```

Proton 占用官方 directoryFlow 席位后，把占用前的原 winner 请回自己的树里渲染：原 entry 不卸载、不迁移，注册与生命周期仍由官方 registry 和 Cordis 管理。最后一份 Proton 内容卸载后，Outlet 撤离，官方 occupant 自然恢复。

## 包

| 包 | 职责 |
| --- | --- |
| `dsh-proton` | RegionRegistry、RegionHost、OriginalSlotEntry、native directoryFlow Outlet |
| `dsh-proton-remote-workspace` | mesh Decorator、远端工作区列表与同源 API client |
| `dsh-proton-seat` | 席位档：占住 `sidebar.workspaces`，可整包丢弃。当前只有 manifest 与文档，不构建、不挂载 |

## 快速开始

在仓库根执行：

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
node --check packages/core/lib/client.js
node --check packages/remote-workspace/lib/client.js
```

## 联调前置

1. 类型基线以 `packages/*/package.json` 的 `dsh.engines.dsh` 为准，文档不重复版本号。
2. 安装并挂载包含 `/api/mesh/anchor` 的 dsh-workspace-mesh。
3. 配置 mesh peers 与 assignment，使 `/api/mesh/state` 能看到远端工作区。
4. 在同一个 DSH profile 中挂载 `dsh-proton` 与 `dsh-proton-remote-workspace`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/design/standalone-composition.md](docs/design/standalone-composition.md) | 结构、支持边界、已知锐边、非目标、验收判据的唯一出处 |
| [packages/core/README.md](packages/core/README.md) | 核心包提供什么 |
| [packages/remote-workspace/README.md](packages/remote-workspace/README.md) | mesh Decorator 做什么、不做什么 |
| [packages/seat/README.md](packages/seat/README.md) | 席位档为什么单独成包 |
| [AGENTS.md](AGENTS.md) | 给 agent 的仓库规则、事实归属与偏差裁决 |

暂不建的目录：需要查字段/端点/错误码时建 `docs/reference/`；需要逐步操作手册时建 `docs/how-to/`。没有内容的象限不提前建空壳。

## 未核实

- 真实窗口中的点击、焦点、HMR 与卸载：缺运行中 DSH 的人工验收。单测只覆盖 React 层组合，不覆盖浏览器行为。
- mesh 列表与锚点 Promise 的晚到拒绝路径：缺针对性测试；现有 active/ticket 守卫未变。
