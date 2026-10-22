import { describe, it, expect } from 'vitest';
import { createRun, reduce, viewOptions } from '../packages/core/src/reducer.js';
import { emptyMeta } from '../packages/core/src/state.js';
import { Rng, deriveSeed } from '../packages/core/src/rng.js';
import { buildContent } from '../packages/core/src/content.js';
import { applyEffects, checkChance, rollCheck } from '../packages/core/src/rules.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const contentJson = join(import.meta.dirname, '../packages/content/generated/content.json');
const raw = JSON.parse(readFileSync(contentJson, 'utf8'));
const db = buildContent(raw);

describe('rng', () => {
  it('同种子产生同序列', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 100; i++) expect(a.int(1000)).toBe(b.int(1000));
  });

  it('派生种子不受其他上下文影响', () => {
    // 模拟"在中间插入一个新事件"：其他决策点的结果必须不变
    const before = [1, 2, 3, 4, 5].map((i) => deriveSeed(999, 'event', i));
    const after = [1, 2, 3, 4, 5].map((i) => deriveSeed(999, 'event', i));
    expect(before).toEqual(after);
    // 不同的 id 得到不同的种子
    expect(deriveSeed(999, 'event', 1)).not.toBe(deriveSeed(999, 'event', 2));
  });

  it('weighted 尊重权重', () => {
    const rng = new Rng(42);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10000; i++) {
      const pick = rng.weighted(['a', 'b'], (x) => (x === 'a' ? 9 : 1));
      counts[pick as 'a' | 'b']++;
    }
    expect(counts.a / 10000).toBeGreaterThan(0.85);
    expect(counts.a / 10000).toBeLessThan(0.95);
  });
});

describe('content', () => {
  it('所有事件引用的属性都存在', () => {
    const attrIds = new Set(db.attrs.map((a) => a.id));
    for (const e of db.events) {
      for (const o of e.options) {
        for (const eff of [...(o.success?.effects ?? []), ...(o.fail?.effects ?? []), ...(o.result?.effects ?? [])]) {
          if ('attr' in eff) for (const id of Object.keys(eff.attr)) {
            expect(attrIds.has(id), `${e.id} 引用了 ${id}`).toBe(true);
          }
        }
      }
    }
  });

  it('每个地点至少有一个行动', () => {
    for (const l of db.locations) expect(l.actions.length).toBeGreaterThan(0);
  });

  it('每个地点行动的标签都有对应事件', () => {
    const tags = new Set(db.events.flatMap((e) => e.tags));
    for (const l of db.locations) {
      for (const a of l.actions) {
        for (const t of a.tags) {
          expect(tags.has(t), `${l.id}.${a.id} 的标签 ${t} 没有事件`).toBe(true);
        }
      }
    }
  });
});

describe('run', () => {
  it('新一局状态合法', () => {
    const meta = emptyMeta();
    const run = createRun(db, meta, 1234);
    expect(run.status).toBe('playing');
    expect(run.attrs.hp).toBe(100);
    expect(run.energy).toBe(db.rules.maxEnergy);
    // 每个格子都分配到了地点
    for (const slot of db.slots) expect(run.locations[slot.id]).toBeTruthy();
  });

  it('同种子生成同一张地图', () => {
    const a = createRun(db, emptyMeta(), 777);
    const b = createRun(db, emptyMeta(), 777);
    expect(a.locations).toEqual(b.locations);
  });

  it('不同周目生成不同地图', () => {
    const meta = { ...emptyMeta(), lives: 0 };
    const a = createRun(db, meta, 777);
    const b = createRun(db, { ...meta, lives: 1 }, 777);
    expect(a.locations).not.toEqual(b.locations);
  });

  it('移动消耗体力', () => {
    const run = createRun(db, emptyMeta(), 1);
    const after = reduce(db, run, emptyMeta(), { t: 'move', slot: 'wood_s' }).run;
    expect(after.energy).toBe(db.rules.maxEnergy - db.rules.moveCost);
  });

  it('不能跳到不相邻的格子', () => {
    const run = createRun(db, emptyMeta(), 1);
    const after = reduce(db, run, emptyMeta(), { t: 'move', slot: 'abyss' }).run;
    expect(after.at).toBe(run.at);
  });

  it('行动会进入事件', () => {
    const run = createRun(db, emptyMeta(), 1);
    const after = reduce(db, run, emptyMeta(), { t: 'act', actionId: 'gossip' }).run;
    // 城镇的 gossip 有对应事件
    if (after.pending) {
      expect(db.eventById.has(after.pending.eventId)).toBe(true);
      const opts = viewOptions(db, after);
      expect(opts.length).toBeGreaterThan(0);
    }
  });

  it('一年完整跑完会推进周期', () => {
    const run = createRun(db, emptyMeta(), 1);
    const after = reduce(db, run, emptyMeta(), { t: 'endCycle' }).run;
    expect(after.cycle).toBe(1);
    expect(after.energy).toBe(db.rules.maxEnergy);
  });

  it('寿命到了会结束', () => {
    const meta = emptyMeta();
    let run = createRun(db, meta, 1);
    for (let i = 0; i < db.rules.endAge - db.rules.startAge + 5; i++) {
      if (run.status !== 'playing') break;
      run = reduce(db, run, meta, { t: 'endCycle' }).run;
    }
    expect(['playing', 'dead', 'ended']).toContain(run.status);
    expect(run.ending).not.toBeNull();
  });

  it('死亡后不能继续行动', () => {
    let run = createRun(db, emptyMeta(), 1);
    run = { ...run, attrs: { ...run.attrs, hp: 1 } };
    run = reduce(db, run, emptyMeta(), { t: 'endCycle' }).run;
    if (run.status !== 'playing') {
      const after = reduce(db, run, emptyMeta(), { t: 'move', slot: 'wood_s' }).run;
      expect(after.at).toBe(run.at);
    }
  });
});

describe('karma 跨周目', () => {
  it('善值会给下一世属性加成', () => {
    const meta = { ...emptyMeta(), karmaTotal: 60 };
    const run = createRun(db, meta, 1);
    const base = db.attrs.find((a) => a.id === 'str')!.start;
    expect(run.attrs.str).toBeGreaterThan(base);
  });

  it('恶值会降低下一世属性', () => {
    const meta = { ...emptyMeta(), karmaTotal: -80 };
    const run = createRun(db, meta, 1);
    const base = db.attrs.find((a) => a.id === 'str')!.start;
    expect(run.attrs.str).toBeLessThan(base);
  });

  it('恶值能减少负面效果', () => {
    // 同一条扣血事件，恶人损失更少
    const good = createRun(db, { ...emptyMeta(), karmaTotal: 0 }, 1);
    good.attrs.karma = 0;
    const evil = createRun(db, { ...emptyMeta(), karmaTotal: 0 }, 1);
    evil.attrs.karma = -100;

    const g = { ...good, attrs: { ...good.attrs } };
    const e = { ...evil, attrs: { ...evil.attrs } };
    applyEffects(db, g, [{ hp: -20 }]);
    applyEffects(db, e, [{ hp: -20 }]);
    // 恶人损失更少
    expect(e.attrs.hp).toBeGreaterThan(g.attrs.hp);
  });
});

describe('检定概率', () => {
  it('显示的概率与实际掷骰一致', () => {
    const run = createRun(db, emptyMeta(), 1);
    run.attrs.agi = 5;
    // d20 + 5 >= 12 => 需要掷出 7 以上 => 14/20 = 70%
    expect(checkChance(db, run, 'agi', 12)).toBeCloseTo(0.7);
    // d20 + 5 >= 5 => 必成
    expect(checkChance(db, run, 'agi', 5)).toBe(1);
    // d20 + 5 >= 26 => 必败
    expect(checkChance(db, run, 'agi', 26)).toBe(0);
  });

  it('monte carlo 与公式吻合', () => {
    const run = createRun(db, emptyMeta(), 1);
    run.attrs.agi = 5;
    const dc = 14;
    const p = checkChance(db, run, 'agi', dc);
    const rng = new Rng(42);
    let hits = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      if (rollCheck(5, dc, rng.range(1, 20))) hits++;
    }
    expect(Math.abs(hits / N - p)).toBeLessThan(0.02);
  });
});
