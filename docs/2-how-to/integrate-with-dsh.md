> **状态**：步骤已实施；真实窗口的人工验收未做
> **日期**：2026-11-04
> **读者**：要把这个 PoC 挂进 DSH 的人
> **上游材料**：[设计](../4-explanation/standalone-composition.md) · [Region API](../3-reference/region-api.md)

# 接入 DSH 联调与人工验收

## 前置

1. Node ≥ 20 与 pnpm。
2. 类型基线与 `packages/*/package.json` 里的 `dsh.engines.dsh` 一致（文档不重复版本号）。
3. 需要本机之外的来源时，另外挂上该 backend 自己发布的质子来源适配包（本仓库不含，例如 mesh 侧）。
4. 至少一个来源已通过 `ctx.protonWorkspace.addSource()` 注册；没有来源时，目录流只剩「本机」一条路。

## 构建

在仓库根执行：

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
node --check packages/core/lib/client.js
node --check packages/adapter-dsh/lib/client.js
node --check packages/workspace/lib/client.js
```

## 挂载

本仓库的 `cordis.patch.yml` 故意为空：挂载权归部署者的 profile patch，Entry 因此唯一且属 profile 所有。在**同一个** DSH profile 中挂载：

- `dsh-proton`（核心运行时）
- `dsh-proton-adapter-dsh`（把官方 directory-flow 席位接到核心）
- `dsh-proton-workspace`（工作区域；远端来源由 backend 侧的适配包注册，例如 `dsh-workspace-mesh` 的浏览器半区）

## 人工验收

单测只覆盖 React 层组合，下面这些必须在真实窗口里逐条确认。**未确认前不得声称验收通过**：

- 打开目录流先出现「本机 / 已注册来源」选择，原生目录对话框没有抢先弹出。
- 选本机：原生 OS picker 或官方 browse dialog 正常出现并可用，选中后 `onPicked` 收到路径。
- 选来源：列表来自已注册来源，含来源标签与候选项；选中后经 `adopt()` 拿到本地路径，并由官方 `onPicked` 交回会话。
- 取消与关闭：不留下悬挂状态；重复点击被单操作守卫挡住。
- 焦点：对话框可获得焦点，Tab 顺序正常；Esc 关闭后焦点回到触发元素。
- HMR：改 Decorator 后热更新不重复注册，不出现两个对话框。
- 卸载：撤掉 Proton 后官方目录流恢复原样，不需要重启。

## 排错

| 现象 | 先查 |
| --- | --- |
| 抛 `Proton 暂不支持原 slot entry 的 X` | 被接管的 entry 超出支持边界，见设计文档「支持边界」 |
| 来源列表为空 | 来源适配包是否挂载并向 `ctx.protonWorkspace.addSource()` 注册；其 `list()` 是否返回候选 |
| 选本机没反应 | Decorator 是否真的调用了 `next()` |
| 官方流程被抢走 | 初次打开是否提前调用了 `next()` |

## 未覆盖

- 各 backend 来源自身的失败与晚到语义（`list()` / `adopt()`），不在本仓库的测试范围内。
