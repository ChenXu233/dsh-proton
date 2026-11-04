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

- `packages/core`（`dsh-proton`）——通用组合运行时：Region 注册表与 Host、接管官方 single slot 的 Outlet、把官方原 entry 请回来渲染的 `OriginalSlotEntry`。它不知道 mesh 的存在。
- `packages/remote-workspace`（`dsh-proton-remote-workspace`）——只为 `workspace.directoryFlow` 注册一个 Decorator：选本机走 `next()` 回到官方流程，选远端渲染 mesh 列表并通过 `/api/mesh/anchor` 建锚点。
- `packages/seat`（`dsh-proton-seat`）——只有 manifest 与 README 的占位包，目前没有任何源码。它单独成包的唯一理由是**可丢弃**：官方补齐后整包删除，而不是从包里挑函数删。

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
| 结构、支持边界、已知锐边、非目标、验收判据 | `docs/design/standalone-composition.md` |
| 验证命令 | `README.md`「快速开始」 |
| 包职责 | `README.md` 包表 + 各包 `README.md` |
| 仓库规则、偏差裁决 | 本文件 |
| 文档导航 | `README.md`「文档」一节 |

`docs/superpowers/{specs,plans}/` 是 superpowers 工作流的**进行中**产物目录。任务落地后，把仍然成立的内容折进 `docs/design/`，原件删除，不留归档。

## 代码与文档不一致时

两者回答不同问题，没有谁天然优先：代码回答「现在怎么跑」，`docs/design/` 回答「当时决定了要什么」。

- 实现是对的、意图已经变了 → 改 `docs/design/`。
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

- 改代码后按下表同步：新端点/字段/边界 → `docs/design/`；新命令 → README 快速开始；新包 → README 包表 + 该包 README。
- 删文档前：① 写清独有内容折进了哪份文档的哪一节；② 确认没有别的文档链接它。
- 文档过期直接删，不归档；但仓库尚无首个 commit 时，删除会真的丢内容，先用快照兜底。

## 判据

```sh
pnpm test && pnpm typecheck && pnpm build
node --check packages/core/lib/client.js
node --check packages/remote-workspace/lib/client.js
```

这些判据只证明「能跑」，不是人工验收。真实窗口里的点击、焦点、HMR、卸载仍需人工确认；未确认就不许说「验收通过」。
