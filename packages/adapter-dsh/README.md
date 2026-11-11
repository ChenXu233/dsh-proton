# dsh-proton-adapter-dsh

质子 · DSH 适配层。官方 slot key 与官方 owner props 契约只出现在这个包。

职责三条：

- 把官方 single slot 接到质子的通用 outlet：两个 directory-flow 席位、工作区列表（`sidebar.workspaces`），以及按需接管的 composer 座位（`conversation.composer.bar`）。
- 以 `DirectoryFlowContext` 的名字重新导出官方 owner 契约。业务域不必直接 import `ui-workspace`。
- 提供 `ctx.protonComposer`：消费者调用 `addSubmitTap()` 才接管 composer 座位，最后一份释放后座位撤离。只装工作区的组合因此不经过质子的 composer 渲染。

composer 座位只在有消费者申请时存在；没有申请时 composer 完全由官方渲染。这个包不渲染 UI，也不引入业务依赖。上游补齐更细的槽位，或质子不再需要包住这些席位时，可以直接删除这个包。core 与各域包不受影响。
