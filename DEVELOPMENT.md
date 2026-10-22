# 开发文档（给 AI 接手用）

> 给下一个接手这个项目的 AI 或你自己看。目标是：**读完这一篇，就能不胡思乱想地改代码。**
>
> 用户是 Go 后端开发者，前端几乎零基础，**前端开发完全交给你**。
> 他负责玩、给反馈、决定内容方向；你负责写和改。

---

## 0. 三十秒了解这个项目

一个单机、多周目的人生模拟 Roguelike（参考《异世轮回录》）。

玩家从 16 岁活到 60 岁（或更早死），每年选一个地点做一件事，触发事件做选择，
用 d20 + 属性做检定。死了之后带着善恶进入下一世。

**当前进度：M1 骨架已完成，能玩完整一局。**

---

## 1. 怎么打开

### 只是想玩（推荐）

桌面上有一个 **`轮回`** 快捷方式，双击就行。

或者直接打开：

```
D:\bb\game\release\win-unpacked\轮回.exe
```

这是解压后的版本，启动是瞬时的。**不要**用 `release\轮回-0.1.0-portable.exe` 日常玩——
portable 每次启动都要把 112MB 解压到临时目录，慢好几秒。portable 是给拷给别人用的。

### 改了代码之后，想看到新版本

```bash
npm run play
```

这一条会重新构建 + 打开游戏窗口。**改了代码就必须跑这个**，
否则你双击的还是旧版本。

### 想重新生成快捷方式 / 换电脑

```bash
npm run dist      # 重新打包（约 1-2 分钟）
```

然后在 `release\win-unpacked\轮回.exe` 上右键 →「发送到」→「桌面快捷方式」。

---

## 2. 开发模式（改代码时用这个）

```bash
cd D:/bb/game
npm run dev
```

窗口自动弹出。改 `.tsx` / `.css` 保存后界面会热更新。

> **改了 `packages/content/` 下的 YAML 必须重启 `npm run dev`**，
> 热更新不会重新编译内容。

DevTools 用 `F12` 或 `Ctrl+Shift+I`。

### 第一次在新电脑上

```bash
npm install
```

装完检查 Electron 二进制有没有下下来：

```bash
ls node_modules/electron/dist/electron.exe
```

没有就补（国内常见）：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
```

`package-lock.json` 已经提交，版本不会漂。

### 其他命令

| 命令 | 作用 |
|---|---|
| `npm run content` | 只编译 YAML → JSON，带完整校验。改了内容就跑这个 |
| `npm run test` | 20 个测试：随机确定性、跨周目善恶、检定概率、地图生成 |
| `npm run typecheck` | 两套 tsconfig 都检查一遍 |
| `npm run sim` | **无头模拟 2000 局**，输出数值分布 + 诊断。调平衡必用 |
| `npm run sim -- --runs 5000` | 模拟更多局 |
| `npm run sim -- --policy greedy` | 换策略（每次都选成功率最高的） |
| `npm run build` | 生产构建到 `out/` |
| `npm run dist` | 打包出安装包到 `release/`（NSIS + portable） |
| `npm run pack` | 只打包不压缩，出 unpacked 目录，调试打包问题用 |

### 存档在哪

```
C:\Users\<你>\AppData\Roaming\bb-game\saves\
```

- `meta.json` —— 跨周目数据（轮回次数、累计善恶、见过的结局）。**这个不能坏。**
- `run.json` —— 当前这一世的存档。坏了就重开一局，不要紧。

想重置游戏，删掉这两个文件。

> 开发版和打包版共用这个目录（`src/main/index.ts` 里 `app.setName('bb-game')` 固定了，
> 否则中文产品名会变成乱码路径）。

### 常见问题

**双击没反应 / 白屏** → 打开终端跑 `npm run dev`，看有没有报错。

**改了代码但游戏没变** → 你双击的是旧包。跑 `npm run play`。

**改了 YAML 但没生效** → 跑 `npm run content`，然后重启 `npm run dev`。

---

## 3. 项目结构

```
D:/bb/game/
├── packages/
│   ├── core/                    ← 纯 TS 游戏逻辑，不 import React / Phaser
│   │   └── src/
│   │       ├── types.ts           数据类型定义（ContentDb、EventDef、Effect...）
│   │       ├── state.ts           RunState（这一世）/ MetaState（跨周目）
│   │       ├── reducer.ts         ★ 全部游戏逻辑都在这：reduce(state, action)
│   │       ├── rules.ts           检定、效果应用、死亡判定、善恶换算
│   │       ├── rng.ts             确定性随机
│   │       └── content.ts         YAML 校验（zod）和加载
│   │
│   └── content/
│       ├── content/             ← 游戏内容，全是 YAML，改这里不碰代码
│       │   ├── rules.yaml         全局规则（年龄、体力、掉血曲线、结局门槛）
│       │   ├── attrs.yaml         属性定义
│       │   ├── slots.yaml         地图格子
│       │   ├── locations.yaml     地点和行动
│       │   └── events/            事件（core/second/ending 三个文件）
│       └── generated/           ← 自动生成，别手改
│           ├── content.json
│           └── ids.ts
│
├── src/
│   ├── main/index.ts            Electron 主进程：窗口、app:// 协议、存档 IO、截图模式
│   ├── preload/index.ts         IPC 桥（只有 saveApi 三个方法）
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx           入口，加载 content.json 并 buildContent
│           ├── App.tsx            根组件，按 phase 切标题/游戏/结算
│           ├── store.ts           ★ useGame：把 reducer 接到 React
│           ├── fx.ts              单向特效通道（Phaser 层以后订阅这里）
│           ├── styles.css         全部样式
│           └── components/
│               ├── MapView.tsx      地图（含迷雾）
│               ├── ActionPanel.tsx  地点行动 + 顶栏
│               ├── EventView.tsx    事件卡和结果
│               ├── Sidebar.tsx      生命/属性/善恶/宿命/日志
│               └── Screens.tsx      标题页、结算页
│
├── scripts/
│   ├── build-content.ts        YAML → JSON
│   ├── sim.ts                  无头模拟器
│   └── autoplay.js             自动玩一局（截图验证用）
│
├── tests/core.test.ts
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / .node.json / .web.json
└── README.md
```

---

## 4. 数据流（最重要的一张图）

```
        YAML 内容
           │  npm run content（zod 校验）
           ▼
    generated/content.json
           │  buildContent()
           ▼
        ContentDb ──────────────┐
                                │
   用户点击                      ▼
   ────────►  dispatch(Action)
                   │
                   ▼
          reduce(db, run, meta, action)
                   │
                   ├──► { run, meta }   ← React setState，重新渲染
                   │
                   └──► fx: FxEvent[]   ← fxBus.emit()，特效层订阅
```

**单向。界面不改状态，只发 Action。** 这是整套架构的地基，不要破。

### 三个 Action 的语义

```ts
type Action =
  | { t: 'move'; slot: string }      // 移动到相邻格子
  | { t: 'act'; actionId: string }   // 在当前地点执行行动（会抽事件）
  | { t: 'choose'; index: number }   // 事件里选选项
  | { t: 'dismiss' }                 // 关掉事件结果
  | { t: 'endCycle' }                // 结束这一年
  | { t: 'nextLife' }                // 结算完进下一世
```

---

## 5. 绝对不能破坏的五条规矩

写新代码前先读这五条。违反了会埋雷，而且很久之后才炸。

### 5.1 core 里不许 import 任何渲染代码

`packages/core/` 不允许出现：

```ts
import ... from 'react'      ✗
import ... from 'phaser'     ✗
import ... from '@core/reducer' 在 renderer 里 ✓（反过来是对的）
```

**原因**：`scripts/sim.ts` 直接 import core 跑几千局。core 一旦依赖渲染，模拟器就跑不了了，
而你调平衡全靠模拟器。

### 5.2 不许用 `Math.random()`

全部走 `packages/core/src/rng.ts`：

```ts
import { Rng } from './rng.js';
const rng = new Rng(seed);        // 或 new Rng(hashText(`${seed}:${ctx}`))
rng.int(20)                        // [0,20)
rng.range(1, 20)                   // [1,20]
rng.chance(0.3)
rng.weighted(pool, e => e.weight)
```

**关键**：每个随机需求从 `(seed, 上下文)` 派生一个独立流，**不要用一条全局消费流**。
否则你在中间插一个新事件，后面所有随机结果全变，旧存档失效、模拟数据不可比、bug 复现不了。

### 5.3 改 `MetaState` 必须加迁移函数

`src/renderer/src/store.ts` 里的 `migrateMeta`：

```ts
export function migrateMeta(m: MetaState): MetaState {
  let out = m;
  if ((out.schemaVersion ?? 0) < 1) { ... }
  // 加新字段就在这里补：
  // if ((out.schemaVersion ?? 0) < 2) { out = { ...out, newField: 默认值, schemaVersion: 2 }; }
  return out;
}
```

`meta.json` 是玩家玩了二十周目的东西。坏了这个游戏就完了。
加字段时同时把 `META_SCHEMA_VERSION` 加 1。

### 5.4 检定概率必须和掷骰一致

`rules.ts`：

```ts
// 概率：(21 - (dc - 属性)) / 20，钳制到 [0, 1]
export function checkChance(...): number

// 掷骰：d20 + 属性 >= dc
export function rollCheck(attrValue, dc, roll): boolean
```

这两个函数**必须保持数学等价**。玩家看到的百分比就是真实概率，
测试里有蒙特卡洛验证（`tests/core.test.ts` 的「检定概率」组）。

### 5.5 存档写入必须原子

`src/main/index.ts` 的 `save:write` 已经处理了（写 `.tmp` 再 rename）。
不要改成直接 `writeFile`。

---

## 6. 改内容（最常做的事）

### 6.1 加一个事件

新建或编辑 `packages/content/content/events/*.yaml`：

```yaml
- id: e_winter_fever        # 全局唯一，改了会让旧存档里的 seen 失效
  title: 热病                # 可选，显示在卡片顶部
  tags: [town, social]       # 挂在哪些标签池里（决定在哪能抽到）
  weight: 12                 # 权重，越大越容易抽到
  once: true                 # 可选：一局只触发一次
  unique: true               # 可选：整个存档只触发一次
  requires:                  # 可选：触发条件
    - progressMin: 20
  text: "镇子里开始有人发烧……"
  options:
    - text: 留在镇上帮忙
      check: { attr: int, dc: 11 }     # 有 check 就必须同时写 success 和 fail
      success:
        text: "你找到了传染的源头。"
        effects: [{ karma: 10 }, { attr: { int: 1 } }, { knowledge: k_fever_source }]
      fail:
        text: "你也病倒了。"
        effects: [{ hp: -10 }]
    - text: 离开镇子
      result:                          # 没有 check 时用 result
        text: "你走了。回来时镇子空了一半。"
        effects: [{ karma: -8 }]
    - text: "【前世记忆】源头是井水，不是人传人"
      requires: [{ knowledge: k_fever_source }]   # 跨周目解锁
      result:
        text: "你封了井。这一年镇上没有一个人发烧。"
        effects: [{ karma: 15 }, { progress: 8 }, { flag: f_well_sealed }]
```

改完跑 `npm run content`。它会检查：属性名拼错、id 重复、检定缺 fail、标签没有事件等。

### 6.2 标签（tags）怎么用

**事件挂在标签上，行动决定能抽哪些标签。**

```
地点「铁矿山」的行动「下坑干活」 → tags: [work, mine]
                                        │
                                        ▼
                        抽事件时，从所有带 work 或 mine 的事件里按权重抽
```

当前标签分布（`npm run content` 会打印）：

```
social 7  risk 6  explore 6  wild 6  work 5  lore 5  mine 4
trade 4  gather 3  rumor 3  pray 3  town 3  holy 2  rest 2
study 1  hunt 1  abyss 2  final 1  dig 1
```

**`study`、`hunt`、`dig` 只有 1 个事件**，这几个池子很快会重复。想加内容优先补这几个。

### 6.3 效果和条件速查

效果（写在 `effects:` 数组里）：

| 写法 | 含义 |
|---|---|
| `{ attr: { str: 1, agi: -2 } }` | 改属性（自动钳制到 min/max） |
| `{ hp: -5 }` / `{ gold: 30 }` / `{ energy: 1 }` | 改资源 |
| `{ karma: 5 }` | 改善恶 |
| `{ flag: "x" }` | 记标记 |
| `{ knowledge: "x" }` | 获得跨周目知识（会写进 meta） |
| `{ progress: 10 }` | 推进宿命 |
| `{ text: "..." }` | 追加一段叙述 |

条件（写在 `requires:` 数组里）：

| 写法 | 含义 |
|---|---|
| `{ attr: str, min: 10 }` | 属性 ≥ |
| `{ attrMax: hp, max: 40 }` | 属性 ≤ |
| `{ flag: "x" }` | 有标记 |
| `{ knowledge: "x" }` | 有知识 |
| `{ karmaMin: -30 }` | 善恶 ≥ |
| `{ goldMin: 50 }` | 钱够 |
| `{ progressMin: 45 }` | 进度够 |

### 6.4 改属性系统（用户说过以后可能大改）

**这是特意设计成可以整个重来的。**

`attrs.yaml` 里改，代码里只有 `Record<string, number>`：

```yaml
attributes:            # 五维，参与检定
  - id: str
    name: 力量
    abbrev: 力
    kind: stat
    start: 5           # 开局值
    max: 20            # 上限
    color: "#c0392b"   # 以后换美术用
    desc: 搬运、搏斗、强行突破。

resources:             # 资源，日常消耗
  - id: hp
    ...

karma:                 # 善恶，必须有且只有一个
  id: karma
  tiers:               # 分档，从低到高，value >= at 时进入这一档
    - at: -100
      name: 魔头
    - at: 0
      name: 中立
```

想加一个"魔力"、把五维改成六维、把金钱改成"灵石"——**只改这个文件**。
但注意：**所有事件里的 `attr: { 旧id: ... }` 都要同步改**，否则 `npm run content` 会报错（这是好事）。

### 6.5 改数值平衡

`rules.yaml` 里这几个是调手感的核心：

```yaml
startAge: 16          # 开局年龄
endAge: 60            # 寿终年龄
maxEnergy: 2          # 每年体力
moveCost: 1           # 移动消耗

hpDrain:
  startCycle: 6       # 前 6 年不掉血
  everyCycles: 6      # 之后每 6 年，每年多掉 1 点

death:                # 低血量死亡判定
  rollBelow: 0.3      # 生命低于 30% 开始掷骰
  slope: 3.0          # 概率 = (0.3 - 生命比例) * 3

karma:                # 善恶如何影响下一世
  statBonusDivisor: 20    # 善值每 20 点，五维各 +1
  statPenaltyDivisor: 40  # 恶值每 40 点，五维各 -1
  penaltyReduction: 0.4   # 恶值 -100 时，负面效果减 40%
  carryover: 0.5          # 死亡时善恶带一半过去

endingThreshold: 45   # 宿命进度够这个数才能打结局
```

**改完必须跑 `npm run sim` 验证。** 不要凭感觉。

---

## 7. 调平衡：用模拟器，不要用感觉

```bash
npm run sim -- --runs 3000
```

输出长这样：

```
=== 结局 ===
  殒命    79.8%
  寿终    0.0%
  按类型：
    殒命       79.8%
    假结局      20.2%

=== 寿命 ===
  年龄  p10 38  p50 46  p90 50  均值 45.1

=== 一局体验量 ===
  触发事件  p10 28  p50 40  p90 47
  宿命进度  p50 55  p90 100  均值 60.3  (结局门槛 45)

=== 诊断 ===
  ⚠ 一局触发 40 个事件，事件池只有 36 个，重复率会很高。
```

### 当前基线（2026-10-21）

| 指标 | 值 | 说明 |
|---|---|---|
| 殒命 / 假结局 | 79.8% / 20.2% | 随机乱点的人 20% 能打到结局 |
| 寿命中位 | 46 岁 | 大部分人在 60 岁前死 |
| 一局事件数 | 40 | 事件池只有 36 个 → 重复是当前最大问题 |
| 进度中位 | 55 | 门槛 45 |
| 善恶均值 | +20.6 | 随机选的偏善 |

### 已知待办

- **事件只有 36 个，一局要抽 40 次。重复严重。** 这是 M2 的核心任务，
  目标 150+。优先补 `study` / `hunt` / `dig` / `rest` 这几个只有 1-2 个事件的池子。
- 寿终概率 0%：`hpDrain` 让所有人都在 60 岁前死。如果想让"活到老死"成为可能，
  调小 `hpDrain.everyCycles` 或者降低事件伤害。
- `town` 的四个行动各占 ~12%，因为城镇在中心且体力有限时会退回这里。
  如果觉得"玩家太常待在城里"，可以调整地图连线让城镇不那么便利。

---

## 8. 界面（React 部分）

### 组件职责

| 文件 | 职责 |
|---|---|
| `App.tsx` | 按 `phase` 切三屏：title / playing / ended。组装其它组件 |
| `MapView.tsx` | 7 格地图 + 连线 + 迷雾。点相邻格子发 `move` |
| `ActionPanel.tsx` | 当前地点的行动按钮 + 顶栏（年龄/体力/结束这一年） |
| `EventView.tsx` | 事件卡（选项/检定概率）和结果卡（掷骰明细/继续） |
| `Sidebar.tsx` | 生命条、五维、善恶轴、宿命进度、最近日志 |
| `Screens.tsx` | 标题页 + 结算页 |

### 状态管理

没有用 Redux/Zustand，就一个 `useGame` hook（`store.ts`）：

```ts
const game = useGame(db);
game.run        // RunState | null
game.meta       // MetaState
game.phase      // 'title' | 'playing' | 'ended'
game.dispatch({ t: 'move', slot: 'wood_s' })
```

所有游戏状态都在 `run` 和 `meta` 里，改完整个对象替换（reducer 是纯函数）。

### 样式

全部在 `styles.css`，CSS 变量在文件顶部：

```css
:root {
  --bg: #0d0f14;
  --text: #d8dee9;
  --accent: #c9a227;    /* 金色，主色调 */
  --good: #7bd88f;
  --bad: #e05c5c;
  ...
}
```

想换风格改这一块。字体是衬线（`--font`）配无衬线 UI（`--font-ui`）。

### 美术

**现在全是色块。** 这是故意的。`attrs.yaml` 和 `locations.yaml` 里的 `color` 字段
就是给以后换素材留的钩子。

---

## 9. Electron 部分

### `app://` 协议（不要改回 `file://`）

`src/main/index.ts`：

```ts
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: {...} }]);
...
win.loadURL('app://game/index.html');
```

**为什么**：生产环境用 `file://` 加载，Phaser 的 fetch / WebAudio / 字体
会被 Chromium 同源策略拦掉。这是 Electron + Web 游戏最常见的坑。

`protocol.handle('app', ...)` 里有目录穿越防护，不要删。

### 存档 IPC

`preload/index.ts` 暴露三个方法给渲染进程：

```ts
window.saveApi.write(slot, jsonString)   // 原子写
window.saveApi.read(slot)                // 返回 string | null
window.saveApi.remove(slot)
```

渲染进程没有 Node 权限（`contextIsolation: true`、`nodeIntegration: false`）。
**不要为了图方便打开 nodeIntegration。**

### 截图模式（验证界面的唯一可靠办法）

```bash
# 标题页
npx electron . --shot=/tmp/title.png

# 自动玩一局到结束
npx electron . --shot=/tmp/end.png \
  --shot-script="$(cat scripts/autoplay.js)" \
  --shot-wait=8000 \
  --shot-track

# 打包后的程序也能用
./release/win-unpacked/轮回.exe --shot=/tmp/packed.png
```

`--shot-track` 会每 400ms 打印一次界面状态，用来确认自动播放真的在跑。

**坑（踩过）**：`executeJavaScript` 里的脚本不能用 `[...document.querySelectorAll()]`
展开语法，会静默失败。`scripts/autoplay.js` 特意写成 ES5 风格
（`for (var i...)`），不要"优化"成现代语法。

**坑（踩过）**：`executeJavaScript` 在 React 挂载之前就执行了，
所以脚本必须**轮询等待按钮出现**，不能假设立刻能点。

---

## 10. 打包

```bash
npm run dist     # → release/轮回-0.1.0-x64.exe (NSIS) + 轮回-0.1.0-portable.exe
npm run pack     # 只出 release/win-unpacked/，快，用来验证
```

配置在 `electron-builder.yml`。当前：

- NSIS 安装包：per-user 安装，不需要管理员权限，**只有它支持自动更新**
- portable：绿色版，给不想装的人
- `asar: true`
- **没有 icon**（用的是 Electron 默认图标）。以后放 `build/icon.ico`（256×256）就会被自动用上。

---

## 11. 路线图和预留接口

| 里程碑 | 内容 | 现状 |
|---|---|---|
| M1 | 骨架：地图、事件、检定、死亡、结算、跨周目善恶、存读档 | ✅ 完成 |
| M2 | 内容：事件 36 → 150+，NPC 好感度，天赋选择 | 待做 |
| M2.5 | 真结局：多个跨周目条件组合 | 占位已留 |
| M3 | Go 后端：匿名遥测、云存档 | 未开始 |
| M4 | Phaser 特效层 | 接口已留 |
| M5 | 美术替换 | 色块占位 |

### 真结局的占位在哪

`packages/core/src/reducer.ts` 的 `finalEnding()`：

```ts
// 真结局占位：M1 永远不满足。
const isTrue = run.flags.includes('__true_ending_enabled__') && karma >= 45;
```

触发点是 `events/ending.yaml` 里的 `e_abyss_final`（tag `final`）。
`pickEvent` 里有一条特殊逻辑：**带 `final` 标签的事件一旦条件满足就必定触发**，不跟普通事件抢权重。

### Phaser 层的预留接口

`src/renderer/src/fx.ts` 已经在发这些事件了：

```ts
export type FxEvent =
  | { type: 'shake'; intensity: number }
  | { type: 'flash'; color: string }
  | { type: 'burst'; at: 'center' | 'location'; color: string }
  | { type: 'toast'; text: string; tone: 'good' | 'bad' | 'neutral' }
  | { type: 'scene'; scene: 'map' | 'event' | 'death' | 'ending' };

fxBus.subscribe(fx => { ... })   // Phaser 层只要订阅这个
```

**接入时的规矩**（之前和用户定过）：
- DOM 拥有全部交互，**canvas 永远 `pointer-events: none`**
- 单向：React → `fxBus` → Phaser。**Phaser 不直接改 UI**
- Phaser 只画背景、粒子、屏震、转场

### Go 后端的边界

用户是 Go 后端，但**后端只做元数据**：账号、云存档、排行榜、遥测、内容热更、强制更新。
**核心玩法必须完全离线可跑。**

优先级：**遥测 > 云存档 > 崩溃上报 > 内容包 > 排行榜**。

遥测的价值：把每局结构（种子、天赋、属性曲线、死亡原因、选择分布）上报，
用真实数据看"哪个事件没人选""哪个天赋胜率异常"。这是自己玩多少遍都得不到的信息。

---

## 12. 已知的技术债

按重要程度排：

1. **事件量不足**（36 个 vs 一局 40 次触发）。这是唯一真正影响体验的问题。
2. **`e_mine_night` 的「退出去」选项没有 result**，会走空结果。校验现在允许了
   （有 check 时 success/fail 二选一即可），但这类空选项最好补上文案。
3. `rules.check.bonus` 字段保留了但没有实际使用。
4. `MetaState` 里的 `uniqueSeen` / `knowledge` / `endings` 已经存了但 UI 还没展示。
5. 没有图标。
6. 没有崩溃上报和日志落盘——玩家报 bug 时你拿不到现场。
7. 真结局只有占位判定，没有任何实际内容。

---

## 13. 环境

| | 版本 |
|---|---|
| 操作系统 | Windows 11 |
| Node | v26.8.1 |
| npm | 11.19.0 |
| TypeScript | 7.0.2（原生编译器，**`baseUrl` 被移除了**，paths 必须写相对路径） |
| Vite | 8.3.4 |
| React | 19.3.1 |
| Electron | 44.9.2 |
| Phaser | 未安装（M4 才加） |
| npm registry | npmmirror（国内） |

### TypeScript 7 注意事项

- `baseUrl` 已被移除，`paths` 必须用 `./` 开头的相对路径
- 不要照抄网上 TS 5 的 tsconfig

### 别踩的坑

- **不要用 `file://` 加载生产资源**（见第 8 节）
- **不要开 `nodeIntegration`**
- **不要改 `packages/content/generated/`**，那是生成的
- **不要在 core 里 import react/phaser**
- **不要用 `Math.random()`**
- 改 YAML 后记得 `npm run content`

---

## 14. 建议的下一步

按用户的实际需求，最该做的是：

### 先让他玩

对用户来说，现在最有价值的不是加功能，而是**他自己玩三局然后反馈**：
哪段无聊、哪次死得不服气、哪个选项不想点。

### 然后优先补内容

补齐事件到 150+，重点补这些池子：

```
study 1  hunt 1  dig 1  rest 2  holy 2  abyss 2
```

补内容的顺序应该是：**先补一局里高频出现的池子**（`work`、`social`、`explore`、`risk`），
再补低频的。用 `npm run sim` 看事件重复率来判断。

### 内容写完再考虑

- NPC 好感度（用户提过，但还没设计）
- 真结局的实际内容
- 天赋选择（M2 的一部分）

### 不要提前做

- Phaser 层（等玩法稳了再说）
- Go 后端（等有玩家了再说）
- 美术（等玩法验证完再说）
