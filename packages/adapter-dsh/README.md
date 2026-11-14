# dsh-proton-adapter-dsh

质子 · DSH 适配层。官方 slot key 与官方 owner props 契约只出现在这个包。

职责四条：

- 把官方 single slot 接到质子的通用 outlet：两个 directory-flow 席位、工作区列表（`sidebar.workspaces`），以及两个按需接管的座位：composer（`conversation.composer.bar`）与模型选择器（`conversation.input.model`）。
- 以 `DirectoryFlowContext` 的名字重新导出官方 owner 契约。业务域不必直接 import `ui-workspace`。
- 提供 `ctx.protonComposer`：消费者调用 `addSubmitTap()` 才接管 composer 座位，最后一份释放后座位撤离。只装工作区的组合因此不经过质子的 composer 渲染。
- 提供 `ctx.protonModelSeat`：消费者调用 `addRouter()` 才接管模型选择器，并按会话决定这个选择器的 `available` / `select` / `load` / `directory`。官方那条 entry 对寻址子代理会话是被围起来的，这个席位是唯一能把选择送到别处的接缝。

两个座位都只在有消费者申请时存在；没有申请时 composer 与模型选择器完全由官方渲染。契约类型走只含类型的子路径 `dsh-proton-adapter-dsh/composer` 与 `dsh-proton-adapter-dsh/model-seat`，不把官方槽位声明带进消费者。这个包不渲染 UI，也不引入业务依赖。上游补齐更细的槽位，或质子不再需要包住这些席位时，可以直接删除这个包。core 与各域包不受影响。
