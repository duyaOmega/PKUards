# 卡池平衡实验操作

`--policy adaptive` 使用游戏实际策略：工学的单位攻击基地估值乘以 1.75，其余学科保持基准；这是已观察到的打法适配，结果须与统一策略分开报告。

`--policy balanced` 使用基准估值；`--policy pressure` 对双方统一把单位攻击基地的估值乘以 1.75，用来检查结果是否依赖偏保守的交换策略。它是诊断策略，不是更高级的模型或额外代理。

使用已有 Node.js，PowerShell 7 中在 `D:\PKUards` 运行，不安装代码包。

```powershell
node scripts/balance.mjs --audit-only --out artifacts/card-audit.json
node scripts/balance.mjs --rounds 20 --seed 20261115 --out artifacts/balance-training.json
node scripts/balance.mjs --rounds 20 --seed 771913 --out artifacts/balance-holdout.json
node scripts/balance.mjs --rounds 20 --seed 20261115 --policy pressure --out artifacts/balance-pressure.json
```

`--audit-only` 仅比较单位的实际机制，输出完全重复单位和同机制下的身材差异。`--rounds` 是每组对阵的种子数，允许 1–200；每个种子交换先后手，六组非镜像对阵共 `12 × rounds` 场。`--seed` 是整数种子基数；训练使用 `20261115`，保留集使用 `771913`。`--out` 是报告路径，默认 `artifacts/balance.json`。修改卡牌后应启动新的 Node 进程。

报告包含各学科胜负、六组配对、先手胜率、轮数、单位与指令使用统计及逐局可复现结果。Wilson 区间计算于有胜负的对局，平局单列；同种子配对并非严格独立样本，区间不是显著性检验。双方均为本地可见信息策略 AI，不能将结果直接写成人类玩家胜率。

研究结果与逐版变更记录在同目录 `conclusion.md`。验证目标包括机制正确、共享单位不被同型白板无代价替代、学科有明确打法，以及没有预组在本 AI 样本中持续大幅落后。卡牌数值在 `web/data.js`，新效果实现位于 `web/engine.js`，AI 必须同步理解效果，之后再运行实验。
