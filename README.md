# 轮回

一个单机、多周目的人生模拟 Roguelike。参考《异世轮回录》。

你被召唤到另一个世界，从十六岁开始，活到六十岁，或者更早死去。
每次死亡，都会带着一点东西进入下一世。

---

## 现在能玩到什么（M1）

- 7 格地图，每局随机生成地点身份
- 一年一回合，60 岁自然寿终，生命归零提前死亡
- 36 个事件，检定（d20 + 属性）、善恶、宿命进度
- 低血量时每周期掷死亡骰，概率**明确显示**
- 死亡结算页：回放这一世的关键选择
- 跨周目：善恶带入下一世。善 → 初始属性更高；恶 → 初始属性更低，但负面效果减伤
- 存读档（自动保存）

**还没有**：Phaser 特效层、Go 后端、真结局、深渊战斗、NPC 好感度。
这些都有预留位置，见下面的路线。

---

## 怎么跑

### 只想玩

双击桌面上的 **`轮回`**，或直接打开：

```
D:\bb\game\release\win-unpacked\轮回.exe
```

### 改完代码后想看到新版本

```bash
npm run play
```

### 开发模式

```bash
npm install
npm run content   # 改了 YAML 之后必须跑一次
npm run dev
```

如果 `npm install` 之后 Electron 没下载成功（国内常见），手动补一下：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
```

### 其他命令

```bash
npm run build       # 构建
npm run dist        # 打包出 NSIS 安装包 + portable exe（在 release/ 下）
npm run test        # 跑测试
npm run sim         # 无头模拟 1000 局，输出数值分布（这是最重要的工具）
```

---

## 改内容：只改 YAML，不碰代码

所有游戏内容都在 `packages/content/content/`：

| 文件 | 内容 |
|---|---|
| `rules.yaml` | 全局规则：年龄、体力、生命流失曲线、死亡判定、善恶换算 |
| `attrs.yaml` | 属性定义。改这里就能重设整套属性系统 |
| `slots.yaml` | 地图格子（位置、连线、固定地点） |
| `locations.yaml` | 地点和行动。行动的 `tags` 决定能抽到哪些事件 |
| `events/*.yaml` | 事件。**这是游戏的主体** |

改完任何 YAML，跑一次 `npm run content`。它会做完整校验：
引用了不存在的属性、事件 id 重复、检定缺 success/fail、格子连到不存在的邻居——
全部在构建时报错，不会等到玩到一半才炸。

### 写一个事件

```yaml
- id: e_woods_child          # 全局唯一
  title: 林中的孩子           # 可选
  tags: [gather, explore]     # 挂在哪些标签池里
  weight: 16                  # 权重
  once: true                  # 可选：一局只触发一次
  unique: true                # 可选：整个存档只触发一次
  requires:                   # 可选：触发条件
    - progressMin: 20
  text: "树根旁蹲着个孩子……"
  options:
    - text: 送他回镇子
      check: { attr: wil, dc: 11 }   # 有 check 就必须同时写 success 和 fail
      success:
        text: "天亮前你们到了镇口。"
        effects: [{ karma: 10 }, { attr: { wil: 1 } }, { knowledge: k_plague_village }]
      fail:
        text: "半路上他发起抖来。"
        effects: [{ hp: -6 }]
    - text: 装作没看见
      result:                        # 没有 check 时用 result
        effects: [{ karma: -5 }]
    - text: "【前世记忆】他三天后会死在镇口"
      requires: [{ knowledge: k_plague_village }]   # 跨周目解锁
      result:
        effects: [{ karma: 15 }, { progress: 8 }]
```

效果写法：

| 写法 | 含义 |
|---|---|
| `{ attr: { str: 1, agi: -2 } }` | 改属性 |
| `{ hp: -5 }` / `{ gold: 30 }` / `{ energy: 1 }` | 改资源 |
| `{ karma: 5 }` | 改善恶 |
| `{ flag: "x" }` | 记一个标记 |
| `{ knowledge: "x" }` | 获得跨周目知识 |
| `{ progress: 10 }` | 推进宿命 |
| `{ text: "..." }` | 追加一段叙述 |

条件写法：

| 写法 | 含义 |
|---|---|
| `{ attr: str, min: 10 }` | 属性不低于 |
| `{ attrMax: hp, max: 40 }` | 属性不高于 |
| `{ flag: "x" }` | 有这个标记 |
| `{ knowledge: "x" }` | 有这条知识 |
| `{ karmaMin: -30 }` | 善恶不低于 |
| `{ goldMin: 50 }` | 钱够 |
| `{ progressMin: 45 }` | 进度够 |

---

## 调数值

**不要靠感觉改数字。** 跑模拟：

```bash
npm run sim                      # 1000 局随机策略
npm run sim -- --runs 5000       # 更多局
npm run sim -- --policy greedy   # 每次都选成功率最高的选项
```

输出会告诉你：寿命分布、一局触发多少事件、多少比例打到了结局、哪个行动被滥用。
底部的"诊断"会直接指出问题，比如：

```
⚠ 一半的人在 17 岁就死了。前期难度过高。
⚠ 最热门的行动占了 99.9% 的所有行动。说明有"最优解"，玩家不需要做选择。
```

目前的基线（随机策略，2000 局）：

| 指标 | 值 |
|---|---|
| 殒命 / 假结局 | 79% / 21% |
| 寿命中位 | 46 岁 |
| 一局触发事件 | 40 个 |
| 宿命进度中位 | 56（门槛 45） |

---

## 代码结构

```
packages/
  core/          纯 TypeScript 状态机。不 import React，不 import Phaser，
                 可以脱离界面单独跑（模拟器就是这么做的）
    types.ts     数据结构的类型定义
    state.ts     RunState（这一世）/ MetaState（跨周目）
    reducer.ts   reduce(state, action) -> { state, fx }  ← 全部游戏逻辑在这
    rules.ts     检定、效果、死亡判定、善恶换算
    rng.ts       确定性随机（同 seed 必出同一局）
    content.ts   YAML 校验和加载
  content/       内容（YAML）和生成的 JSON

src/
  main/          Electron 主进程、app:// 协议、存档 IO
  preload/       IPC 桥
  renderer/      React 界面
    src/store.ts useGame：把 reducer 接到 React
    src/fx.ts    单向特效通道（Phaser 层以后订阅这里）
    src/components/

scripts/
  build-content.ts  YAML → JSON，带完整校验
  sim.ts            无头模拟器
  autoplay.js       自动玩一局（截图验证用）
```

### 几条必须守住的规矩

1. **core 里不许 import 任何渲染代码。** 不然模拟器跑不起来，回放也不可能做。
2. **不许用 `Math.random`。** 全部走 `rng.ts`。随机数按"决策点"派生，
   不是一条全局流——这样在中间插事件不会打乱后面所有结果。
3. **改 `MetaState` 结构时必须同时加迁移函数**（`src/renderer/src/store.ts` 的 `migrateMeta`）。
   `meta` 存档是玩家玩了二十周目的东西，坏了这个游戏就完了。
4. **界面只读 core 的状态，不反过来改。** Phaser 层将来也只订阅 `fxBus`，不碰 DOM。

---

## 路线

- [x] **M1** 骨架：地图、事件、检定、死亡、结算、跨周目善恶、存读档
- [ ] **M2** 内容：把事件从 36 扩到 150+，加 NPC 好感度、天赋选择
- [ ] **M2.5** 真结局：多个跨周目条件组合
- [ ] **M3** Go 后端：匿名遥测（用真实数据调平衡）、云存档
- [ ] **M4** Phaser 特效层：`fx.ts` 已经在发事件了，订阅即可
- [ ] **M5** 美术替换：现在全是色块

---

## 关于美术

现在所有东西都是色块 + 文字。这是故意的——先把"好不好玩"验证完，再花钱花时间做画面。
`attrs.yaml` 和 `locations.yaml` 里的 `color` 字段就是给以后换素材留的位置。
