# dsh-proton-adapter-dsh

质子 · DSH 适配层。整个质子家族里**唯一**允许知道官方 slot key 与官方 owner props 契约的包。

职责只有两条：把官方单槽（目前是两个 directory-flow 席位）接到质子的通用 outlet 上；把官方 owner 契约以 `DirectoryFlowContext` 的名字重新导出，让业务域不需要直接 import `ui-workspace`。

不包含任何业务语义：不知道远端、不知道 mesh、不渲染任何 UI。

上游补齐更细的槽位、或质子不再需要包住这些席位时，删掉这个包即可 —— core 与各域包都不受影响。
