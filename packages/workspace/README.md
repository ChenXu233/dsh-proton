# dsh-proton-workspace

质子 · 工作区域：让侧栏的工作区座位由质子托管，同时把官方浏览器原样请回来。

## 它做什么

1. **喂官方 entry 的 kit**：官方 `@deepseek-ai/dsh-client-ui-workspace` 的 entry 被质子影子后，由 `entrySources` 合成它需要的 `useWorkspaces`、`t`（`locale.bind('workspace')`）与 store 实例，交给 entry face 渲染**官方原组件**——不复制、不改写。
2. **开区段**：`workspace.list` region 的 contributions 就是"区段"。后端包只往这里注册，拿到 owner props（与官方浏览器同一份），自画自己的那段。
3. **目录流装饰**：官方 `directoryFlow` 子槽外边挂一层 `WorkspaceFlow`，让"打开文件夹"多一条来源的路。

## 用法

```ts
inject = ['slots', 'proton', 'locale', 'workspaces']

ctx.protonWorkspace.addSection({
  id: 'remote',
  order: 10,
  render: (owner) => <RemoteSection owner={owner} />,
})
```

区段渲染在官方列表**之后**，拿不到官方列表本身：它不能替换、不能包裹、不能重渲官方。

## 边界

core 只提供 region / 条目 / 影子 / entry face / 分栏；本包只管"工作区"这个域的 kit 与区段入口。远程段的内容由 `dsh-proton-workspace-remote-mesh` 提供。
