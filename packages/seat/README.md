# dsh-proton-seat

质子 · 席位档。默认不安装。

**当前状态：只有 `package.json` 与本文，没有任何源码，也不参与构建。** 下面写的是它接管席位时承担的职责，不是现在可用的能力：

- 占住 `sidebar.workspaces` 这个 single 席位；
- 复刻官方工作区列的行为；
- 声明工作区行级子槽，并注册探针让 `dsh-proton` 发现它。

接口尚未落地：`dsh-proton` 的 `ProtonRegionMap` 目前只有 `workspace.directoryFlow`、`workspace.row`、`workspace.actions`，没有行级 trailing 子槽，也没有 `ctx.protonSeat`。实现时以核心的类型定义为准，并把本文改成真实接口名。

单独成包的理由只有一个：**可丢弃**。占席位的代码一旦和契约混在一个包里，「官方补齐后删掉厚的那部分」就变成从包里挑函数，而不是删一个包。
