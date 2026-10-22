import type { ContentDb, Effect, Requirement, AttrDef } from './types.js';
import type { RunState } from './state.js';

export function attrDef(db: ContentDb, id: string): AttrDef | undefined {
  return db.attrs.find((a) => a.id === id);
}

export function getAttr(run: RunState, id: string): number {
  return run.attrs[id] ?? 0;
}

export function applyClamp(db: ContentDb, id: string, v: number): number {
  const def = attrDef(db, id);
  if (!def) return v;
  return Math.min(def.max, Math.max(def.min, v));
}

/** 生命比例 0..1 */
export function hpRatio(db: ContentDb, run: RunState): number {
  const def = attrDef(db, 'hp');
  const max = def?.max ?? 100;
  return Math.max(0, Math.min(1, getAttr(run, 'hp') / max));
}

/** 按 tiers 取档位名。tiers 按 at 升序，取满足 >= at 的最高档。 */
export function tierName(def: AttrDef, value: number): string | null {
  if (!def.tiers || def.tiers.length === 0) return null;
  const sorted = [...def.tiers].sort((a, b) => a.at - b.at);
  let name: string | null = null;
  for (const t of sorted) {
    if (value >= t.at) name = t.name;
    else break;
  }
  // 比最低档还低时，用最低档的名字
  return name ?? sorted[0]?.name ?? null;
}

// ---------------------------------------------------------------- 条件

export function meetsRequirement(db: ContentDb, run: RunState, req: Requirement): boolean {
  if ('attr' in req) return getAttr(run, req.attr) >= req.min;
  if ('attrMax' in req) return getAttr(run, req.attrMax) <= req.max;
  if ('flag' in req) return run.flags.includes(req.flag);
  if ('knowledge' in req) return run.knowledge.includes(req.knowledge);
  if ('karmaMin' in req) return getAttr(run, db.karmaId) >= req.karmaMin;
  if ('karmaMax' in req) return getAttr(run, db.karmaId) <= req.karmaMax;
  if ('goldMin' in req) return getAttr(run, 'gold') >= req.goldMin;
  if ('progressMin' in req) return run.progress >= req.progressMin;
  return false;
}

export function meetsAll(db: ContentDb, run: RunState, reqs?: Requirement[]): boolean {
  if (!reqs || reqs.length === 0) return true;
  return reqs.every((r) => meetsRequirement(db, run, r));
}

export function describeRequirement(db: ContentDb, req: Requirement): string {
  if ('attr' in req) {
    const d = attrDef(db, req.attr);
    return `${d?.name ?? req.attr} ≥ ${req.min}`;
  }
  if ('attrMax' in req) {
    const d = attrDef(db, req.attrMax);
    return `${d?.name ?? req.attrMax} ≤ ${req.max}`;
  }
  if ('flag' in req) return `需要线索：${req.flag}`;
  if ('knowledge' in req) return `需要知识：${req.knowledge}`;
  if ('karmaMin' in req) return `善恶 ≥ ${req.karmaMin}`;
  if ('karmaMax' in req) return `善恶 ≤ ${req.karmaMax}`;
  if ('goldMin' in req) return `金钱 ≥ ${req.goldMin}`;
  if ('progressMin' in req) return `进度 ≥ ${req.progressMin}`;
  return '';
}

// ---------------------------------------------------------------- 检定

/**
 * 检定成功率。掷骰是 d20 + 属性 >= 难度，所以概率是精确的二项分布：
 *   P = (21 - required) / 20，required = 难度 - 属性
 * 这个数字必须和 rollCheck 完全一致——玩家看到的百分比就是真实概率。
 */
export function checkChance(_db: ContentDb, run: RunState, attrId: string, dc: number): number {
  const value = getAttr(run, attrId);
  const need = dc - value;
  if (need <= 1) return 1;
  if (need > 20) return 0;
  return (21 - need) / 20;
}

/** 检定掷骰：d20 + 属性 >= dc */
export function rollCheck(attrValue: number, dc: number, roll: number): boolean {
  return roll + attrValue >= dc;
}

// ---------------------------------------------------------------- 效果

export interface EffectResult {
  /** 实际发生的文本（用于 UI 与日志） */
  texts: string[];
  /** 属性变化，用于 UI 做高亮动画 */
  deltas: { id: string; from: number; to: number }[];
}

/**
 * 应用一组效果。所有数值修改都经过钳制。
 * karma 受"恶值减伤"影响：恶值越高，负面效果越小。
 */
export function applyEffects(db: ContentDb, run: RunState, effects?: Effect[]): EffectResult {
  const res: EffectResult = { texts: [], deltas: [] };
  if (!effects) return res;

  const karmaBefore = getAttr(run, db.karmaId);
  // 恶值越高，负面效果越轻（这正是玩家选择作恶的短期回报）
  const evil = Math.max(0, -karmaBefore) / 100;
  const reduction = evil * db.rules.karma.penaltyReduction;

  const change = (id: string, delta: number) => {
    const before = getAttr(run, id);
    let d = delta;
    if (d < 0 && id !== db.karmaId) d = d * (1 - reduction);
    const after = applyClamp(db, id, before + (d < 0 ? -Math.ceil(-d) : Math.floor(d)));
    if (after !== before) {
      run.attrs[id] = after;
      res.deltas.push({ id, from: before, to: after });
    }
  };

  for (const e of effects) {
    if ('attr' in e) {
      for (const [id, delta] of Object.entries(e.attr)) change(id, delta);
    } else if ('hp' in e) {
      change('hp', e.hp);
    } else if ('energy' in e) {
      run.energy = Math.max(0, run.energy + e.energy);
    } else if ('gold' in e) {
      change('gold', e.gold);
    } else if ('karma' in e) {
      // 善恶本身不参与"恶值减伤"
      const before = getAttr(run, db.karmaId);
      const after = applyClamp(db, db.karmaId, before + e.karma);
      if (after !== before) {
        run.attrs[db.karmaId] = after;
        res.deltas.push({ id: db.karmaId, from: before, to: after });
      }
    } else if ('flag' in e) {
      if (!run.flags.includes(e.flag)) run.flags.push(e.flag);
    } else if ('knowledge' in e) {
      if (!run.knowledge.includes(e.knowledge)) run.knowledge.push(e.knowledge);
      res.texts.push(`〔获得知识：${e.knowledge}〕`);
    } else if ('progress' in e) {
      run.progress = Math.max(0, Math.min(100, run.progress + e.progress));
    } else if ('text' in e) {
      res.texts.push(e.text);
    }
  }

  // 死亡检查
  if (getAttr(run, 'hp') <= 0 && run.status === 'playing') {
    run.status = 'dead';
  }
  return res;
}

// ---------------------------------------------------------------- 死亡

export interface DeathRoll {
  /** 本周期死亡概率 0..1 */
  probability: number;
  /** 是否必死 */
  certain: boolean;
  /** 是否进入警告状态 */
  warning: boolean;
}

export function deathRoll(db: ContentDb, run: RunState): DeathRoll {
  const r = hpRatio(db, run);
  const d = db.rules.death;
  if (r <= d.certainBelow) return { probability: 1, certain: true, warning: true };
  if (r <= d.rollBelow) {
    return {
      probability: Math.min(1, (d.rollBelow - r) * d.slope),
      certain: false,
      warning: true,
    };
  }
  return { probability: 0, certain: false, warning: r <= d.warnBelow };
}

/** 每周期自然流失的生命 */
export function naturalHpDrain(db: ContentDb, run: RunState): number {
  const { startCycle, everyCycles } = db.rules.hpDrain;
  if (run.cycle < startCycle) return 0;
  return 1 + Math.floor((run.cycle - startCycle) / everyCycles);
}
