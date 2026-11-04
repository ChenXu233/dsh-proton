# dsh-proton

质子核心：`RegionRegistry` 与 `RegionHost`，加上把官方 single slot 包进 Region 的通用 outlet。**零产品语义**——不知道工作区、会话或远端，也不认识任何官方 slot key。

业务包通过 `ctx.proton` 注册 Renderer / Decorator / Contribution；域或适配包通过 `ctx.proton.connect(outlets)` 把一个官方 slot 接到某个 Region。Region 名由域包用声明合并补进 `ProtonRegionMap`，core 里那是一个空的可合并接口。

Outlet 排除自身后读取原 winner，用 `OriginalSlotEntry` 复用原 Component 与缓存的 plain inject；原 entry 不卸载、不迁移，注册与生命周期仍归官方 registry。最后一份内容卸载后 Outlet 撤离，官方 occupant 自然恢复。

支持的 entry 形态、已知锐边与验收判据见[设计文档](../../docs/4-explanation/standalone-composition.md)；官方 slot key 与 owner props 契约只出现在 `dsh-proton-adapter-dsh`。

所有注册返回幂等 disposer。调用方应把注册放进自己的 `ctx.effect()`。
