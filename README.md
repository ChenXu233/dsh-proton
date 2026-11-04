# 质子（dsh-proton）

> 当前状态：通用组合层已拆分完成；自动测试、类型检查与构建是验收边界，尚未安装到运行中的 DSH 做人工验收。

质子是 DSH 的**通用 UI 组合层**。它只知道 Region、Renderer、Decorator、Contribution —— 不知道工作区、不知道会话、不知道远端。产品语义由各自的域包实现，backend 细节由各自的适配包实现。

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

| 包 | 职责 |
| --- | --- |
| `dsh-proton` | Region / Renderer / Decorator / Contribution + outlet 接线；零产品语义 |
| `dsh-proton-adapter-dsh` | 唯一知道官方 slot key 与 owner props 契约的一层 |
| `dsh-proton-workspace` | 工作区域：把「添加工作区」装饰成「本机 / 已注册来源」 |

## 两个注册点，别混

- `ctx.proton` —— **组合**注册：`registerRenderer` / `registerDecorator` / `registerContribution` / `connect`。
- `ctx.protonWorkspace` —— **来源**注册：`addSource({ id, label, list(), adopt(id) })`。属于工作区域自己的服务，**不经过 core**。

## 结构与边界

原 winner 共存的机制、支持边界、已知锐边与非目标，唯一出处是[设计文档](docs/4-explanation/standalone-composition.md)；字段与错误码见 [Region API](docs/3-reference/region-api.md)。README 不复述。

## 快速开始

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## 联调

挂载步骤、人工验收清单与排错见[接入 DSH 联调](docs/2-how-to/integrate-with-dsh.md)。

## 文档

- [docs/README.md](docs/README.md) —— 文档导航、四个象限与建目录的触发条件
- [AGENTS.md](AGENTS.md) —— agent 规则、事实归属与偏差裁决
- 包 README：[core](packages/core/README.md) · [adapter-dsh](packages/adapter-dsh/README.md) · [workspace](packages/workspace/README.md)

## 许可证

Apache-2.0，全文见 [LICENSE](LICENSE)。
