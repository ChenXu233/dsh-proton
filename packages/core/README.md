# dsh-proton

质子核心：`RegionRegistry` 与 `RegionHost`。业务包通过 `ctx.proton` 注册 Renderer / Decorator / Contribution，不需要知道官方 slot key。

内置 native adapter 只承载 `workspace.directoryFlow`，映射到 DSH 的两个官方目录流席位（`sidebar.workspaces.directoryFlow`、`conversation.hero.workspace.directoryFlow`），以低于官方 entry 的 priority 注册 Outlet。Outlet 排除自身后读取原 winner，用 `OriginalSlotEntry` 复用原 Component 与缓存的 plain inject；Decorator 可以用 `next()` 决定是否渲染它。原 entry 的注册与生命周期仍归官方 registry，核心不 dispose、不迁移它。

支持的 entry 形态、失败行为与验收判据见[设计文档](../../docs/design/standalone-composition.md)，本文件不复述。

所有注册返回幂等 disposer。调用方应把注册放进自己的 `ctx.effect()`。
