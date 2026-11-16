# 节奏复查操作说明

使用电脑已有 Node.js 与 PowerShell 7，在 `D:\PKUards` 执行，无须安装依赖。

```powershell
node scripts/balance.mjs --seed 20261115 --rounds 20 --policy adaptive --diagnostics --out artifacts/tempo-training.json
node scripts/balance.mjs --seed 20261115 --rounds 20 --policy pressure --diagnostics --out artifacts/tempo-pressure.json
```

`--rounds` 是每组洗牌数，允许 1–200；总场次为它的 12 倍。`--policy adaptive` 为游戏策略，工学攻击基地估值乘 1.75，其余为基准；`pressure` 对双方统一采用进攻估值，`balanced` 对双方统一采用基准。`--seed` 是整数种子基数；本轮训练仍用 `20261115`。最终验证预先选定 `160607`，打开后不能继续称为未见数据。`--out` 控制输出路径。

`--diagnostics` 增加逐局公开过程摘要。`notes.opening` 每行依次为玩家 ID、半回合数、场上单位数、总攻击、手牌数、未花精力、前线归属，记录前三轮各自回合结束。`firstFront` 和 `firstBaseHit` 记录首个推进/基地命中玩家及半回合；`reserveTurn` 记录补给时机。`frontTurns`、`zeroAttackTurns`、`emptyHandTurns`、`unusedEnergy` 为每名玩家各自回合结束的统计。诊断报告以紧凑 JSON 归档，单文件小于 256 KiB，完整大图不入 Git。

CLI 检测到 `--diagnostics` 会自动输出紧凑 JSON；本轮 20 种洗牌的报告约 105 KiB。提高 `--rounds` 后文件会增大，入 Git 前检查文件大小，必要时分批记录。未加诊断时仍输出缩进 JSON。

修改入口：卡牌和预组在 `web/data.js`，补给在 `web/engine.js` 的 `reserve` 动作，AI 在 `web/ai.js`。每个候选保持未涉及的卡牌、预组、策略权重不变，与相同种子基线比较；不要将不同种子的变化直接归因于某张牌。对局结束的空手与零攻击统计用于诊断，不能仅凭相关性得出因果结论。

当前 `baseline-*.json` 对应 `4063a57` 的规则与卡池加诊断记录。将来复现旧候选须使用该候选的 Git 存档；直接在新版本执行相同种子会得到新版本结果。

## 本轮最终规则及复现

`web/data.js` 的 `RULES.reserveEnergy` 当前为 `2`；引擎只在后手的整局一次补给动作中增加这些临时精力，`endTurn` 清除超过常规上限的部分。修改它后同步修改规则文案、浏览器专项预期和规则存档版本。开源补丁的额外抽牌通过 `conditionZeroOp: true` 实现；判断友方实际 `opCost === 0`，敌方零行动费不满足条件。基础抽牌和额外抽牌共用手牌上限，不会虚构容量。

```powershell
node scripts/balance.mjs --seed 160607 --rounds 20 --policy adaptive --out artifacts/v16-replay-adaptive.json
node scripts/balance.mjs --seed 160607 --rounds 20 --policy pressure --out artifacts/v16-replay-pressure.json
npm test
npm run test:discipline
```

`160607` 已用于最终验证及旧版同种子对照，以上是复现命令。下一轮调参必须另选未见验证种子。这里的策略与卡池已冻结，最终报告未被用来追改胜率。

为原样重放旧版，仅需从 `4063a57` 读取 `web/data.js`、`web/engine.js`、`web/ai.js`、`web/tactics.js`、`scripts/balance.mjs` 到一个隔离目录，保持 `web/` 与 `scripts/` 相对结构；不需要安装旧依赖或修改当前源码。运行隔离目录的 `scripts/balance.mjs`，使用同样的 `--seed`、`--rounds` 与 `--policy`。本轮该副本在忽略的 `artifacts/baseline-v15-replay/` 中，命令如下：

```powershell
node artifacts/baseline-v15-replay/scripts/balance.mjs --seed 160607 --rounds 20 --policy adaptive --out artifacts/v15-replay-adaptive.json
```

正式结果为 `holdout-*.json`（新版）、`holdout-baseline-*.json`（原样旧版），不得混淆来源或把不同种子的变化直接写成改动收益。当前规则与测试摘要在 `../browser-qa-v1.6.json`。卡图提示词在同目录 `art-prompts.json`，10 张原始 PNG 留在生图工具目录，正式 WebP 已复制进 `web/assets/art/`；没有安装软件或代码包。
