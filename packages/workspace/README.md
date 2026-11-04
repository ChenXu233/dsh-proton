# dsh-proton-workspace

质子 · 工作区域。

它只做两件事：把「添加工作区」这个官方流程装饰成「本机 / 已注册来源」两条路；把选中的候选交回官方 `onPicked(path)`。

它不认识任何具体 backend —— 不知道 mesh、不知道 SSH、不知道 HTTP。想让自己的工作区出现在这里，注册一个来源即可：

```ts
ctx.protonWorkspace.addSource({
  id: 'acme',
  label: 'Acme 集群',
  async list() { return [{ id: 'repo', title: 'repo', status: 'online' }] },
  async adopt(id) { return { path: '/absolute/local/anchor' } },
})
```

注册点是**本域的服务 `ctx.protonWorkspace`**，不是 core。core 只提供 Region / Renderer / Decorator / Contribution，不知道工作区是什么。

适配具体 backend 的包（例如 mesh）由该 backend 自己发布，不属于本包依赖。
