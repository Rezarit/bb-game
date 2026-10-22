/**
 * 无头模拟器：不开渲染，直接跑几千局，输出数值分布。
 *
 * 用法：
 *   npm run sim                    # 1000 局
 *   npm run sim -- --runs 5000     # 5000 局
 *   npm run sim -- --policy greedy # 选最有把握的选项
 *
 * 这个工具比大多数单元测试有用：它告诉你的不是"代码对不对"，
 * 而是"这个游戏值不值得玩下去"。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContent } from '../packages/core/src/content.js';
import { createRun, reduce, viewOptions, type Action } from '../packages/core/src/reducer.js';
import { emptyMeta, type MetaState, type RunState } from '../packages/core/src/state.js';
import { Rng } from '../packages/core/src/rng.js';
import { getAttr } from '../packages/core/src/rules.js';

const args = process.argv.slice(2);
const runs = Number(argOf('--runs') ?? 1000);
const policy = (argOf('--policy') ?? 'random') as 'random' | 'greedy' | 'karma-pos' | 'karma-neg';
const seedBase = Number(argOf('--seed') ?? 1);

function argOf(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const contentJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '../packages/content/generated/content.json'), 'utf8'),
);
const db = buildContent(contentJson);

interface RunReport {
  life: number;
  cycles: number;
  status: string;
  endingKind: string;
  age: number;
  hp: number;
  karma: number;
  progress: number;
  gold: number;
  stats: Record<string, number>;
  eventsSeen: number;
  actionCounts: Record<string, number>;
}

/** 不同策略下的选项选择 */
function chooseIndex(rng: Rng, run: RunState): number {
  const opts = viewOptions(db, run).filter((o) => o.visible);
  if (opts.length === 0) return 0;

  switch (policy) {
    case 'greedy': {
      // 有检定的选成功率最高的，没检定的优先选最后一个（通常是"避开风险"）
      const withChance = opts.filter((o) => o.chance !== null);
      if (withChance.length > 0) {
        withChance.sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
        return withChance[0]!.index;
      }
      return opts[opts.length - 1]!.index;
    }
    case 'karma-pos':
      return opts[0]!.index; // 事件里的第一个选项通常是最"正面"的
    case 'karma-neg':
      return opts[opts.length - 1]!.index;
    default:
      return opts[rng.int(opts.length)]!.index;
  }
}

function playOne(seed: number, meta: MetaState): RunReport {
  const rng = new Rng(seed);
  let run = createRun(db, meta, seed);
  const actionCounts: Record<string, number> = {};
  let eventsSeen = 0;

  let guard = 0;
  while (run.status === 'playing' && guard++ < 5000) {
    // 1. 如果有待解决事件，先解决
    if (run.pending) {
      const idx = chooseIndex(rng, run);
      const before = run.pending.eventId;
      run = reduce(db, run, meta, { t: 'choose', index: idx }).run;
      if (run.pending?.resolved) {
        eventsSeen++;
        run = reduce(db, run, meta, { t: 'dismiss' }).run;
      }
      void before;
      continue;
    }

    // 2. 体力充足时，在本地和相邻地点里挑一个行动
    const here = db.slots.find((s) => s.id === run.at)!;
    const candidates: { slot: string; actionId: string; energy: number; endsCycle: boolean }[] = [];
    for (const slotId of [run.at, ...here.edges]) {
      const locId = run.locations[slotId];
      const loc = db.locations.find((l) => l.id === locId);
      if (!loc) continue;
      const moveCost = slotId === run.at ? 0 : db.rules.moveCost;
      for (const a of loc.actions) {
        // 跳过"结束这一年"类行动，模拟真实的"先花完体力"
        if (a.endsCycle) continue;
        if (run.energy >= moveCost + a.energy) {
          candidates.push({ slot: slotId, actionId: a.id, energy: moveCost + a.energy, endsCycle: false });
        }
      }
    }

    if (candidates.length === 0) {
      // 3. 没体力了，结束这一年
      const res = reduce(db, run, meta, { t: 'endCycle' });
      run = res.run;
      continue;
    }

    const pick = candidates[rng.int(candidates.length)]!;
    if (pick.slot !== run.at) {
      run = reduce(db, run, meta, { t: 'move', slot: pick.slot } as Action).run;
    }
    const key = `${run.locations[pick.slot]}/${pick.actionId}`;
    actionCounts[key] = (actionCounts[key] ?? 0) + 1;
    run = reduce(db, run, meta, { t: 'act', actionId: pick.actionId }).run;
  }

  return {
    life: run.life,
    cycles: run.cycle,
    status: run.status,
    endingKind: run.ending?.kind ?? 'none',
    age: db.rules.startAge + run.cycle,
    hp: getAttr(run, 'hp'),
    karma: getAttr(run, db.karmaId),
    progress: run.progress,
    gold: getAttr(run, 'gold'),
    stats: Object.fromEntries(db.statIds.map((id) => [id, getAttr(run, id)])),
    eventsSeen,
    actionCounts,
  };
}

// ---------------------------------------------------------------- 主循环

console.log(`模拟 ${runs} 局 · 策略 ${policy}\n`);

const reports: RunReport[] = [];
let meta = emptyMeta();
const actionTotals: Record<string, number> = {};

for (let i = 0; i < runs; i++) {
  // 每一局都是"第一世"，避免跨周目加成污染新手体验的评估
  const r = playOne(seedBase + i, { ...meta, lives: 0, karmaTotal: 0 });
  reports.push(r);
  for (const [k, v] of Object.entries(r.actionCounts)) actionTotals[k] = (actionTotals[k] ?? 0) + v;
}

// ---------------------------------------------------------------- 统计

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function quantile(arr: number[], q: number) {
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.floor((s.length - 1) * q);
  return s[i]!;
}

const ages = reports.map((r) => r.age);
const cycles = reports.map((r) => r.cycles);
const progresses = reports.map((r) => r.progress);
const karmas = reports.map((r) => r.karma);
const events = reports.map((r) => r.eventsSeen);

const dead = reports.filter((r) => r.endingKind === 'death').length;
const aged = reports.filter((r) => r.endingKind === 'age').length;

const byEnding = new Map<string, number>();
for (const r of reports) byEnding.set(r.endingKind, (byEnding.get(r.endingKind) ?? 0) + 1);

console.log('=== 结局 ===');
console.log(`  殒命    ${pct(dead / runs)}`);
console.log(`  寿终    ${pct(aged / runs)}`);
console.log('  按类型：');
for (const [k, n] of [...byEnding].sort((a, b) => b[1] - a[1])) {
  const label =
    k === 'death' ? '殒命' :
    k === 'age' ? '寿终' :
    k === 'false-ending' ? '假结局' :
    k === 'true-ending' ? '真结局' :
    k === 'none' ? '未结束' : k;
  console.log(`    ${label.padEnd(8)} ${pct(n / runs)}`);
}

console.log('\n=== 寿命 ===');
console.log(`  年龄  p10 ${quantile(ages, 0.1)}  p50 ${quantile(ages, 0.5)}  p90 ${quantile(ages, 0.9)}  均值 ${(ages.reduce((a, b) => a + b, 0) / runs).toFixed(1)}`);
console.log(`  回合  p10 ${quantile(cycles, 0.1)}  p50 ${quantile(cycles, 0.5)}  p90 ${quantile(cycles, 0.9)}  (满 ${db.rules.endAge - db.rules.startAge})`);

console.log('\n=== 一局体验量 ===');
console.log(`  触发事件  p10 ${quantile(events, 0.1)}  p50 ${quantile(events, 0.5)}  p90 ${quantile(events, 0.9)}`);
console.log(`  宿命进度  p50 ${quantile(progresses, 0.5)}  p90 ${quantile(progresses, 0.9)}  均值 ${(progresses.reduce((a, b) => a + b, 0) / runs).toFixed(1)}  (结局门槛 ${db.rules.endingThreshold})`);

console.log('\n=== 善恶 ===');
console.log(`  均值 ${(karmas.reduce((a, b) => a + b, 0) / runs).toFixed(1)}  p10 ${quantile(karmas, 0.1)}  p90 ${quantile(karmas, 0.9)}`);

console.log('\n=== 终局属性 ===');
for (const id of db.statIds) {
  const vals = reports.map((r) => r.stats[id]!);
  const def = db.attrs.find((a) => a.id === id)!;
  console.log(`  ${def.name}  起 ${def.start} → p50 ${quantile(vals, 0.5)}  p90 ${quantile(vals, 0.9)}  (上限 ${def.max})`);
}

console.log('\n=== 行动使用率（前 12）===');
const totalActions = Object.values(actionTotals).reduce((a, b) => a + b, 0) || 1;
for (const [k, v] of Object.entries(actionTotals).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${k.padEnd(28)} ${pct(v / totalActions)}`);
}

// ---------------------------------------------------------------- 诊断

console.log('\n=== 诊断 ===');
const problems: string[] = [];

const medianProgress = quantile(progresses, 0.5);
if (medianProgress < db.rules.endingThreshold * 0.6) {
  problems.push(
    `宿命进度中位数只有 ${medianProgress}，结局门槛是 ${db.rules.endingThreshold}。` +
      `大部分玩家一辈子都碰不到结局，会觉得自己在瞎逛。`,
  );
}

const midLife = quantile(ages, 0.5);
if (midLife < 25) {
  problems.push(`一半的人在 ${midLife} 岁就死了。前期难度过高。`);
}
if (midLife > db.rules.endAge - 3) {
  problems.push(`一半的人活到 ${midLife} 岁，死亡几乎不发生。生命值失去压力作用。`);
}

const eventMedian = quantile(events, 0.5);
const contentTotal = db.events.length;
if (eventMedian < 15) {
  problems.push(`一局只触发 ${eventMedian} 个事件，内容量太少，玩家会觉得没发生什么。`);
}
if (eventMedian > contentTotal * 0.7) {
  problems.push(`一局触发 ${eventMedian} 个事件，事件池只有 ${contentTotal} 个，重复率会很高。`);
}

const topActionShare = Object.values(actionTotals).sort((a, b) => b - a)[0]! / totalActions;
if (topActionShare > 0.35) {
  problems.push(`最热门的行动占了 ${pct(topActionShare)} 的所有行动。说明有"最优解"，玩家不需要做选择。`);
}

if (problems.length === 0) {
  console.log('  没有发现明显问题。');
} else {
  for (const p of problems) console.log(`  ⚠ ${p}`);
}
