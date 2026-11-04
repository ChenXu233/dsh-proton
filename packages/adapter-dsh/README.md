# dsh-proton-adapter-dsh

质子 · DSH 适配层。官方 slot key 与官方 owner props 契约只出现在这个包。

职责两条：

- 把官方 single slot（目前是两个 directory-flow 席位）接到质子的通用 outlet。
- 以 `DirectoryFlowContext` 的名字重新导出官方 owner 契约。业务域不必直接 import `ui-workspace`。

这个包只做接线与类型再导出。它不渲染 UI，也不引入业务依赖。上游补齐更细的槽位，或质子不再需要包住这些席位时，可以直接删除这个包。core 与各域包不受影响。
