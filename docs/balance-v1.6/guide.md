# 节奏复查操作说明

使用电脑已有 Node.js 与 PowerShell 7，在 `D:\PKUards` 执行，无须安装依赖。

```powershell
node scripts/balance.mjs --seed 20261115 --rounds 20 --policy adaptive --diagnostics --out artifacts/tempo-training.json
node scripts/balance.mjs --seed 20261115 --rounds 20 --policy pressure --diagnostics --out artifacts/tempo-pressure.json
```

`--rounds` 是每组洗牌数，允许 1–200；总场次为它的 12 倍。`--policy adaptive` 为游戏策略，工学攻击基地估值乘 1.75，其余为基准；`pressure` 对双方统一采用进攻估值，`balanced` 对双方统一采用基准。`--seed` 是整数种子基数；本轮训练仍用 `20261115`。最终验证预先选定 `160607`，打开后不能继续称为未见数据。`--out` 控制输出路径。

`--diagnostics` 增加逐局公开过程摘要。`notes.opening` 每行依次为玩家 ID、半回合数、场上单位数、总攻击、手牌数、未花精力、前线归属，记录前三轮各自回合结束。`firstFront` 和 `firstBaseHit` 记录首个推进/基地命中玩家及半回合；`reserveTurn` 记录补给时机。`frontTurns`、`zeroAttackTurns`、`emptyHandTurns`、`unusedEnergy` 为每名玩家各自回合结束的统计。诊断报告以紧凑 JSON 归档，单文件小于 256 KiB，完整大图不入 Git。

修改入口：卡牌和预组在 `web/data.js`，补给在 `web/engine.js` 的 `reserve` 动作，AI 在 `web/ai.js`。每个候选保持未涉及的卡牌、预组、策略权重不变，与相同种子基线比较；不要将不同种子的变化直接归因于某张牌。对局结束的空手与零攻击统计用于诊断，不能仅凭相关性得出因果结论。

当前 `baseline-*.json` 对应 `4063a57` 的规则与卡池加诊断记录。将来复现旧候选须使用该候选的 Git 存档；直接在新版本执行相同种子会得到新版本结果。
