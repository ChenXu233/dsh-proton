# 文档导航

本仓库文档按「读者读完产出什么」分象限，用物理目录表达。同一事实只有一个家，其余地方只留指针。

| 象限 | 目录 | 读完得到 | 当前内容 |
| --- | --- | --- | --- |
| 学习 | `1-tutorial/` | 能跑起来的第一个东西 | 尚未建立 |
| 任务 | `2-how-to/` | 完成一件具体的事 | [接入 DSH 联调与人工验收](2-how-to/integrate-with-dsh.md) · [给一个 UI 位置提供接入点](2-how-to/expose-a-ui-position.md) |
| 信息 | `3-reference/` | 查到的字段、参数、错误 | [Proton Region API](3-reference/region-api.md) |
| 理解 | `4-explanation/` | 判断「为什么这样设计」 | [原 Slot Winner 共存](4-explanation/standalone-composition.md) |

## 建目录的触发条件

不提前建空目录。出现对应内容时才建：

- `1-tutorial/`：有人要从零写一个下游插件、需要可照抄的最小例子。
- `2-how-to/`：出现新的「完成某件具体事」的步骤文档时。
- `3-reference/`：新增对外可查的字段、枚举或错误码时，优先扩进现有 reference 文档；主题确实不同再拆文件。
- `4-explanation/`：出现第二个需要解释的设计决策时。

## 每份文档的元信息

用 Markdown 引用块，不用 YAML：

```markdown
> **状态**：accepted / 已实施 / 未实施
> **日期**：YYYY-MM-DD
> **读者**：谁会读它
> **上游材料**：依赖哪些文档（相对链接）
> **口径**：数字的范围与测量时间（只对含数字的文档）
```

## 不放的东西

- 决策与执行过程：交给 git 提交历史，不建 `archive/`、不写变更日志。
- 已知未完成项：写在相关文档原位的「未核实」小节，不建 TODO 文件。
- agent 规则：见仓库根 [AGENTS.md](../AGENTS.md)。
