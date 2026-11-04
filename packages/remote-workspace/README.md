# dsh-proton-remote-workspace

dsh-workspace-mesh 的质子 PoC 下游包。

本包只注册 `workspace.directoryFlow` Decorator：用户选择本机时通过 `next()` 回到 Proton 保留的原 native/browse directory flow；选择远端时通过 mesh 的 `/api/mesh/state` 列出工作区，并通过 `/api/mesh/anchor` 创建本地锚点。

本包不包含 SSH、凭据、远程执行或 mesh 的 Host 实现，也不重新实现本机目录选择。远端归属与执行语义由 dsh-workspace-mesh 负责。组合顺序与支持边界见[设计文档](../../docs/4-explanation/standalone-composition.md)。
