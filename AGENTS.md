# AGENTS.md

面向在本仓库工作的 agent。只写稳定约束与判断依据；版本号、行数、进度这类每次提交都会变的东西不写。

## 本文件的规则（改它之前先读）

| # | 规则 | 判据 |
| --- | --- | --- |
| M1 | 加规则要先在对话里提出，说明不加会出什么错，经维护者同意后才写 | 未经同意的规则视为不存在 |
| M2 | 只加「不加就不知道」的稳定知识；易变细节不写 | 一条规则如果每次提交都得改，就不该在这里 |
| M3 | 规则要有判据；但判据 ≠ 脚本，更 ≠ 门禁 | 人读一遍能判的规则，人判即可，不发明检查器 |
| M4 | 同一事实只写一处，其余留指针 | 发现第二份副本就改成链接 |
| M5 | 规则失效就删，不保留历史 | 文档里不出现「以前是」「已废弃」「勘误」 |

## 心智模型

这个仓库是三个 DSH 客户端插件组成的 pnpm workspace，**不修改 DSH 上游，也不修改 dsh-workspace-mesh**：

- `packages/core`（`dsh-proton`）——通用组合运行时：Region 注册表与 Host、接管官方 single slot 的 Outlet、把官方原 entry 请回来渲染的 `OriginalSlotEntry`。它不知道工作区是什么。
- `packages/adapter-dsh`（`dsh-proton-adapter-dsh`）——唯一知道官方 slot key 与官方 owner props 契约的一层：把两个 directory-flow 席位接到 `ctx.proton.connect()`，并转出 `DirectoryFlowContext`。
- `packages/workspace`（`dsh-proton-workspace`）——工作区域：接管 `sidebar.workspaces`（`workspace.list` 区域），把原生列表当作一段贡献参与排序，section 可声明 `replacesNative` 整块顶掉；同时为 `workspace.directoryFlow` 注册 Decorator，选来源走 `ctx.protonWorkspace.addSource()`。不认识任何具体 backend。

**自带列表渲染的包不在本仓库。** 本仓库只提供 section 接缝（`addSection`）；需要自己画整份列表的实现另建，现为 `dsh-workspace-mesh` 仓库的 `packages/workspace-remote-mesh`。不提前建空壳——空壳会诱使人往里凑内容。

改架构前必须知道的物理事实：

- 官方 slot 的 entry 不迁移、不 dispose。Proton 只渲染原 entry，注册与生命周期始终归官方 registry 与 Cordis；`ctx.slots.entries()` 包含 Proton 自己的 Outlet，必须按 component 身份排除，否则递归渲染自己。
- 原 entry 的 `inject` 每次 render 可能返回新值，只能按 entry identity 缓存（`WeakMap`），否则每次渲染都会重启原 native flow。
- `OriginalSlotEntry` 只支持 native/browse directory-flow 的「root scope + plain inject + 无 children/store/locale/hooks/keyedHooks」形态，其他形态必须 fail loud。这不是偷懒：公开 API 拿不到完整的私有渲染上下文，假装通用会静默出错。
- remote workspace 初次打开不得调用 `next()`；一旦调用，官方 native picker 会抢走本机/远端的选择。
- 本地锚点不是远端挂载，agent loop 始终在归属机。

## 事实归属（唯一出处）

| 事实 | 唯一的家 |
| --- | --- |
| 依赖版本、DSH 引擎基线、构建脚本 | 各级 `package.json`（文档只写包名与用途） |
| 结构、支持边界、已知锐边、非目标、验收判据 | `docs/4-explanation/standalone-composition.md` |
| Region、OriginalSlotEntry、mesh 端点的字段与错误 | `docs/3-reference/` |
| 联调步骤、人工验收清单、排错 | `docs/2-how-to/integrate-with-dsh.md` |
| 验证命令 | `README.md`「快速开始」 |
| 包职责 | `README.md` 包表 + 各包 `README.md` |
| 文档导航、象限归属、建目录触发条件 | `docs/README.md` |
| 仓库规则、偏差裁决 | 本文件 |

## 文档分层

`docs/` 按读者产出分象限：`1-tutorial/`（学习）、`2-how-to/`（任务）、`3-reference/`（信息）、`4-explanation/`（理解）。写新内容前先判断象限，再问能否折进该象限已有的文档——默认答案是折进去。

没有内容的象限不建目录；建目录的触发条件只写在 `docs/README.md`，不在这里重复。

`docs/superpowers/{specs,plans}/` 是 superpowers 工作流的**进行中**产物目录。任务落地后，把仍然成立的内容按象限折进 `docs/`，原件删除，不留归档。

## 代码与文档不一致时

两者回答不同问题，没有谁天然优先：代码回答「现在怎么跑」，`docs/4-explanation/` 回答「当时决定了要什么」。

- 实现是对的、意图已经变了 → 改 `docs/4-explanation/`。
- 文档是对的、代码跑偏了 → 改代码。
- 判断不了就停下来问；不要默认任何一方为准，也不要把偏差写成「勘误」段落。

涉及现状一律回读代码与命令输出，不要凭文档断言。

## 写作规则

- 只描述 HEAD。历史由 git 承担，勘误直接覆盖旧结论，不追加更正段落。
- 不写版本号、行数、文件数、当前进度；这些要么从 `package.json` 推，要么从命令输出取。
- 不建 TODO 文件、不建 `archive/`、不留「已废弃」标记。真未知就在原位写「未核实：缺什么依据」。
- 数字（性能、规模）必须标明测量日期与范围，否则不写。
- 新增文档前先问能否折进已有文档的某一节；默认答案是折进去。

## 维护

- 改代码后按下表同步：边界与设计变化 → `docs/4-explanation/`；端点/字段/错误码 → `docs/3-reference/`；新命令 → README 快速开始；新包 → README 包表 + 该包 README。
- 删文档前：① 写清独有内容折进了哪份文档的哪一节；② 确认没有别的文档链接它。
- 文档过期直接删，不归档（历史由 git 承担）。

## 判据

```sh
pnpm test && pnpm typecheck && pnpm build
node --check packages/core/lib/client.js
node --check packages/adapter-dsh/lib/client.js
node --check packages/workspace/lib/client.js
```

这些判据只证明「能跑」，不是人工验收。真实窗口里的点击、焦点、HMR、卸载仍需人工确认；未确认就不许说「验收通过」。
