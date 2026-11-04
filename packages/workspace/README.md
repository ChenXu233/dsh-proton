# dsh-proton-workspace

质子 · 工作区域：把「添加工作区」这个官方流程做成两条路，本机目录或已注册来源。

它做两件事。第一，装饰目录流，让用户在「本机 / 已注册来源」之间选择。第二，把选中的候选交回官方 `onPicked(path)`。

来源由调用方注册。本包只提供注册入口：

```ts
ctx.protonWorkspace.addSource({
  id: 'acme',
  label: 'Acme 集群',
  async list() { return [{ id: 'repo', title: 'repo', status: 'online' }] },
  async adopt(id) { return { path: '/absolute/local/anchor' } },
})
```

`ctx.protonWorkspace` 是工作区域自己的服务。core 只负责 Region 与渲染，不参与来源管理。

backend 适配包由各自的 backend 自己发布，不属于本包依赖。
