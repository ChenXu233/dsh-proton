# dsh-proton

质子核心：`RegionRegistry`、`RegionHost`，以及把官方 single slot 接进 Region 的通用 outlet。

业务包通过 `ctx.proton` 注册 Renderer、Decorator 或 Contribution。域包或适配包调用 `ctx.proton.connect(outlets)`，把一个官方 slot 接到某个 Region。Region 名由域包用声明合并补进 `ProtonRegionMap`。core 只提供这个空接口。

Outlet 先排除自身，再读取原 winner。它用 `OriginalSlotEntry` 复用原 Component 与缓存的 plain inject。质子不卸载、不迁移原 entry，注册与生命周期仍由官方 registry 管理。卸载最后一份内容后，Outlet 撤离，官方实现恢复。

支持的 entry 形态、已知锐边与验收判据见[设计文档](../../docs/4-explanation/standalone-composition.md)。

所有注册返回幂等 disposer。调用方应把注册放进自己的 `ctx.effect()`。
