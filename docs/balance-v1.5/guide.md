# 卡池平衡实验操作

## 调整入口

- `web/data.js`：`CARDS` 的费用、行动费、攻防、关键词和效果；`omittedShared` 决定预组不使用的共享单位，`doubleOrders` 决定哪些学科指令放两张。修改后先检查套牌仍为 39 张、同名不超过 2 张。理学/工学当前为 26 单位、13 指令，人文/社科为 24/15。
- `web/engine.js`：效果实现和 `reserve` 补给动作。补给回复固定 1 点、不超过当前精力上限，仅后手一次；不调用指令钩子，不改变行记指令计数。更改这些语义需同时改界面规则、AI 及保存版本。
- `web/ai.js`：`chooseAction` 的 `pressure` 是攻击基地估值的额外比例，默认仅工学为 `0.75`。`AI_CONFIG.frontierValue` 为占线估值，`cardValue` 为抽牌估值。每次只改可解释的一组因素，并同时报告统一策略控制组，避免用不适配的策略判断某学科一定较弱。

单位数值与技能文案需一起改。`onOrder` 为该单位每个己方回合限一次，`handAtLeast` 在牌离手后检查，`targetAttackAtMost` 检查当前所选单位攻击；`weaken` 不能将攻击降到负数。不要把不同技能的单位仅按攻防总和排序。

## 运行与解释

`--policy adaptive` 使用游戏实际策略：工学的单位攻击基地估值乘以 1.75，其余学科保持基准；这是已观察到的打法适配，结果须与统一策略分开报告。

`--policy balanced` 使用基准估值；`--policy pressure` 对双方统一把单位攻击基地的估值乘以 1.75，用来检查结果是否依赖偏保守的交换策略。它是诊断策略，不是更高级的模型或额外代理。

使用已有 Node.js，PowerShell 7 中在 `D:\PKUards` 运行，不安装代码包。

```powershell
node scripts/balance.mjs --audit-only --out artifacts/card-audit.json
node scripts/balance.mjs --rounds 20 --seed 20261115 --policy adaptive --out artifacts/balance-training.json
node scripts/balance.mjs --rounds 20 --seed 972061 --policy adaptive --out artifacts/balance-holdout.json
node scripts/balance.mjs --rounds 20 --seed 972061 --policy pressure --out artifacts/balance-pressure.json
```

`--audit-only` 仅比较单位的实际机制，输出完全重复单位和同机制下的身材差异。`--rounds` 是每组对阵的种子数，允许 1–200；每个种子交换先后手，六组非镜像对阵共 `12 × rounds` 场。`--seed` 是整数种子基数；训练使用 `20261115`，第一次保留集 `771913` 揭示先手问题后参与了设计，补给后的最终验证使用新种子 `972061`。这两个保留集现在都已打开，下一轮调参须预先另选未见种子，不能将复现称为新的盲测。`--out` 是报告路径，默认 `artifacts/balance.json`。默认策略是 `balanced`，上述命令显式选择 `adaptive`；修改卡牌后应启动新的 Node 进程。

报告包含各学科胜负、六组配对、先手胜率、轮数、单位、指令与补给使用统计及逐局可复现结果。Wilson 区间计算于有胜负的对局，平局单列；同种子配对并非严格独立样本，区间不是显著性检验。双方均为本地可见信息策略 AI，不能将结果直接写成人类玩家胜率。

研究结果与逐版变更记录在同目录 `conclusion.md`。验证目标包括机制正确、共享单位不被同型白板无代价替代、学科有明确打法，以及没有预组在本 AI 样本中持续大幅落后。卡牌数值在 `web/data.js`，新效果实现位于 `web/engine.js`，AI 必须同步理解效果，之后再运行实验。
