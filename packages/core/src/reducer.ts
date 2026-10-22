import type { ContentDb, EventDef, EventOption, Requirement } from './types.js';
import type { RunState, MetaState, LogEntry, Ending } from './state.js';
import { Rng } from './rng.js';
import {
  applyEffects,
  checkChance,
  deathRoll,
  describeRequirement,
  getAttr,
  meetsAll,
  naturalHpDrain,
  rollCheck,
} from './rules.js';

// ---------------------------------------------------------------- fx 通道

/** 渲染层要播的特效。DOM 和 Phaser 都只监听这个单向通道。 */
export type FxEvent =
  | { type: 'shake'; intensity: number }
  | { type: 'flash'; color: string }
  | { type: 'burst'; at: 'center' | 'location'; color: string }
  | { type: 'toast'; text: string; tone: 'good' | 'bad' | 'neutral' }
  | { type: 'scene'; scene: 'map' | 'event' | 'death' | 'ending' };

export interface ReduceResult {
  run: RunState;
  meta: MetaState;
  fx: FxEvent[];
}

export type Action =
  | { t: 'move'; slot: string }
  | { t: 'act'; actionId: string }
  | { t: 'choose'; index: number }
  | { t: 'dismiss' }
  | { t: 'endCycle' }
  | { t: 'nextLife' };

// ---------------------------------------------------------------- 建局

export function createRun(db: ContentDb, meta: MetaState, seed: number): RunState {
  const attrs: Record<string, number> = {};
  for (const a of db.attrs) attrs[a.id] = a.start;

  // 上一世的善恶：善加属性，恶减属性。
  // 恶的短期补偿在 applyEffects 里（负面效果减伤），两者互相制衡。
  const k = meta.karmaTotal;
  const bonus = Math.floor(Math.max(0, k) / db.rules.karma.statBonusDivisor);
  const penalty = Math.floor(Math.max(0, -k) / db.rules.karma.statPenaltyDivisor);
  for (const id of db.statIds) {
    const def = db.attrs.find((a) => a.id === id)!;
    attrs[id] = Math.max(def.min, Math.min(def.max, def.start + bonus - penalty));
  }

  const locations = generateMap(db, seed, meta.lives);
  const energyDef = db.attrs.find((a) => a.id === 'energy');
  const hpDef = db.attrs.find((a) => a.id === 'hp');
  if (hpDef) attrs.hp = hpDef.start;

  // 出生地：有固定地点的格子，否则第一格
  const home = db.slots.find((s) => s.fixedLocation)?.id ?? db.slots[0]!.id;

  return {
    seed,
    life: meta.lives + 1,
    cycle: 0,
    attrs,
    flags: [],
    knowledge: [...meta.knowledge],
    progress: 0,
    locations,
    at: home,
    visited: [home],
    energy: energyDef?.max ?? 2,
    seen: [],
    pending: null,
    log: [],
    status: 'playing',
    ending: null,
    highlights: [],
  };
}

/** 每个非固定格子随机一个地点身份。同一局内尽量不重复。 */
export function generateMap(db: ContentDb, seed: number, life: number): Record<string, string> {
  const rng = new Rng((seed ^ Math.imul(life + 1, 0x9e3779b1)) >>> 0);
  const out: Record<string, string> = {};
  const pool = db.locations.filter((l) => l.weight > 0);
  const used = new Set<string>();

  for (const slot of db.slots) {
    if (slot.fixedLocation) {
      out[slot.id] = slot.fixedLocation;
      used.add(slot.fixedLocation);
    }
  }
  for (const slot of db.slots) {
    if (slot.fixedLocation) continue;
    let candidates = pool.filter((l) => !used.has(l.id));
    if (candidates.length === 0) candidates = pool;
    const picked = rng.weighted(candidates, (l) => l.weight) ?? pool[0];
    if (!picked) continue;
    out[slot.id] = picked.id;
    used.add(picked.id);
  }
  return out;
}

// ---------------------------------------------------------------- reducer

export function reduce(
  db: ContentDb,
  run: RunState,
  meta: MetaState,
  action: Action,
): ReduceResult {
  const fx: FxEvent[] = [];
  let next = run;
  let nextMeta = meta;

  switch (action.t) {
    case 'move':
      next = doMove(db, run, action.slot, fx);
      break;
    case 'act':
      next = doAct(db, run, meta, action.actionId, fx);
      break;
    case 'choose':
      next = doChoose(db, run, action.index, fx);
      break;
    case 'dismiss':
      if (run.pending) {
        const endAfter = run.pending.endAfter;
        next = { ...run, pending: null };
        if (endAfter === 'ending' && next.ending) {
          next = { ...next, status: 'ended' };
          fx.push({ type: 'scene', scene: 'ending' });
        } else {
          fx.push({ type: 'scene', scene: 'map' });
          if (endAfter === true && next.status === 'playing') {
            next = doEndCycle(db, next, fx);
          }
        }
      }
      break;
    case 'endCycle':
      next = doEndCycle(db, run, fx);
      break;
    case 'nextLife': {
      nextMeta = commitMeta(db, run, meta);
      next = createRun(db, nextMeta, (run.seed + 1) >>> 0);
      fx.push({ type: 'scene', scene: 'map' });
      break;
    }
  }

  return { run: next, meta: nextMeta, fx };
}

// ---------------------------------------------------------------- 移动

function doMove(db: ContentDb, run: RunState, slot: string, fx: FxEvent[]): RunState {
  if (run.status !== 'playing' || run.pending) return run;
  const here = db.slots.find((s) => s.id === run.at);
  const target = db.slots.find((s) => s.id === slot);
  if (!here || !target) return run;
  if (slot === run.at) return run;
  if (!here.edges.includes(slot)) {
    fx.push({ type: 'toast', text: '这里过不去', tone: 'bad' });
    return run;
  }
  if (run.energy < db.rules.moveCost) {
    fx.push({ type: 'toast', text: '体力不足，先结束这一年', tone: 'bad' });
    return run;
  }
  const visited = run.visited.includes(slot) ? run.visited : [...run.visited, slot];
  return { ...run, at: slot, visited, energy: run.energy - db.rules.moveCost };
}

// ---------------------------------------------------------------- 行动

function doAct(
  db: ContentDb,
  run: RunState,
  meta: MetaState,
  actionId: string,
  fx: FxEvent[],
): RunState {
  if (run.status !== 'playing' || run.pending) return run;

  const locId = run.locations[run.at];
  const loc = db.locations.find((l) => l.id === locId);
  const act = loc?.actions.find((a) => a.id === actionId);
  if (!act) return run;
  if (!meetsAll(db, run, act.requires)) return run;
  if (run.energy < act.energy) {
    fx.push({ type: 'toast', text: '体力不足', tone: 'bad' });
    return run;
  }

  const spent = run.energy - act.energy;
  const ev = pickEvent(db, run, meta, act.tags);

  if (!ev) {
    // 没有可抽的事件：空过，但体力照扣，避免玩家无限刷
    fx.push({ type: 'toast', text: '这一年这里没什么特别的', tone: 'neutral' });
    const idled = { ...run, energy: spent };
    return act.endsCycle ? doEndCycle(db, idled, fx) : idled;
  }

  return {
    ...run,
    energy: spent,
    pending: { eventId: ev.id, resolved: null, endAfter: act.endsCycle },
    seen: ev.once ? [...run.seen, ev.id] : run.seen,
  };
}

/** 抽事件：用 (seed, cycle, 当前位置) 派生，同一个决策点的结果稳定可复现 */
function pickEvent(
  db: ContentDb,
  run: RunState,
  meta: MetaState,
  tags: string[],
): EventDef | undefined {
  const rng = new Rng(
    (hashText(run.seed + ':' + run.cycle + ':' + run.at + ':' + tags.join(',')) ^ run.energy * 2654435761) >>> 0,
  );
  const pool = db.events.filter((e) => {
    if (!e.tags.some((t) => tags.includes(t))) return false;
    if (e.once && run.seen.includes(e.id)) return false;
    if (e.unique && (meta.uniqueSeen.includes(e.id) || run.seen.includes(e.id))) return false;
    if (!meetsAll(db, run, e.requires)) return false;
    return true;
  });

  // 终局事件一旦条件满足，必定触发，不和普通事件抢权重。
  // 这是玩家一生一次的时刻，不能靠运气。
  const finale = pool.find((e) => e.tags.includes('final'));
  if (finale) return finale;

  return rng.weighted(pool, (e) => e.weight);
}

// ---------------------------------------------------------------- 选择

function doChoose(db: ContentDb, run: RunState, index: number, fx: FxEvent[]): RunState {
  const p = run.pending;
  if (!p || p.resolved || run.status !== 'playing') return run;

  const ev = db.eventById.get(p.eventId);
  const opt = ev?.options[index];
  if (!ev || !opt) return run;
  if (!meetsAll(db, run, opt.requires)) return run;

  const next: RunState = {
    ...run,
    attrs: { ...run.attrs },
    flags: [...run.flags],
    knowledge: [...run.knowledge],
    log: [...run.log],
    highlights: [...run.highlights],
  };

  if (opt.energy) next.energy = Math.max(0, next.energy - opt.energy);

  type ResolvedCheck = { attr: string; dc: number; roll: number; success: boolean };
  let check: ResolvedCheck | null = null;
  let outcome;

  if (opt.check) {
    const rng = new Rng(hashText(`${run.seed}:${run.cycle}:${ev.id}:${index}:check`));
    const roll = rng.range(1, 20);
    const ok = rollCheck(getAttr(next, opt.check.attr), opt.check.dc, roll);
    check = { attr: opt.check.attr, dc: opt.check.dc, roll, success: ok };
    outcome = ok ? opt.success : opt.fail;
    if (ok) fx.push({ type: 'flash', color: '#7bd88f' });
    else {
      fx.push({ type: 'flash', color: '#e74c3c' });
      fx.push({ type: 'shake', intensity: 6 });
    }
  } else {
    outcome = opt.result;
  }

  applyEffects(db, next, outcome?.effects);

  // 记录选择：带检定的、改变善恶的、或者给出了知识的，都是"值得回看"的节点
  const isMemorable =
    Boolean(opt.check) ||
    (outcome?.effects ?? []).some((e) => 'karma' in e || 'knowledge' in e || 'progress' in e);
  if (isMemorable) {
    const mark = check ? (check.success ? '成功' : '失败') : '';
    next.highlights.push({
      cycle: next.cycle,
      text: `${ev.title ?? ev.id}：${opt.text}${mark ? `（${mark}）` : ''}`,
    });
  }
  const resultText = [outcome?.text, ...(outcome?.effects ?? []).flatMap((e) => ('text' in e ? [e.text] : []))]
    .filter(Boolean)
    .join('\n');
  if (resultText) next.log.push({ cycle: next.cycle, text: resultText, kind: 'info' });
  if (next.log.length > 200) next.log = next.log.slice(-200);

  if (next.status === 'dead' && !next.ending) {
    next.ending = { kind: 'death', title: '殒命', text: deathFlavor(db, next) };
    fx.push({ type: 'scene', scene: 'death' });
  }

  // 触发了宿命终局：先让玩家看完这一段结果，点"继续"时才进入结局画面
  if (ev.tags.includes('final') && next.status === 'playing') {
    next.ending = finalEnding(db, next);
    next.pending = { ...p, resolved: { optionIndex: index, outcome: outcome ?? {}, check }, endAfter: 'ending' };
    return next;
  }

  next.pending = { ...p, resolved: { optionIndex: index, outcome: outcome ?? {}, check } };
  return next;
}

/** 假结局的判定。真结局以后在这里加条件。 */
function finalEnding(db: ContentDb, run: RunState): Ending {
  const karma = getAttr(run, db.karmaId);

  // 真结局占位：M1 永远不满足。
  // 真正的条件要等故事写完再定，这里只留一个明确不会误触的骨架。
  const isTrue = run.flags.includes('__true_ending_enabled__') && karma >= 45;
  void isTrue;

  return {
    kind: 'false-ending',
    title: '第七次',
    text:
      '你站在门前，看见了自己的脸。\n\n' +
      '锁链断了两道。门后面有东西在等，等得很久了。\n' +
      '你不知道自己能不能打开它——你只知道，这件事你好像已经做过很多次。\n\n' +
      '——这一世到此为止。你带着知道的东西，走进下一次。',
  };
}

// ---------------------------------------------------------------- 周期结束

function doEndCycle(db: ContentDb, run: RunState, fx: FxEvent[]): RunState {
  if (run.status !== 'playing' || run.pending) return run;

  const next: RunState = { ...run, attrs: { ...run.attrs }, log: [...run.log] };
  next.cycle += 1;

  const drain = naturalHpDrain(db, next);
  if (drain > 0) {
    next.attrs.hp = Math.max(0, getAttr(next, 'hp') - drain);
    pushLog(next, `岁月流逝，生命 -${drain}`, 'bad');
  }

  const energyDef = db.attrs.find((a) => a.id === 'energy');
  next.energy = energyDef?.max ?? 2;

  // 死亡掷骰（每周期一次，概率对玩家可见）
  const roll = deathRoll(db, next);
  if (roll.probability > 0) {
    const rng = new Rng(hashText(`${next.seed}:${next.cycle}:death`));
    if (roll.certain || rng.chance(roll.probability)) {
      next.attrs.hp = 0;
      next.status = 'dead';
      next.ending = { kind: 'death', title: '殒命', text: deathFlavor(db, next) };
      pushLog(next, '你就这样死在了这一年。', 'bad');
      fx.push({ type: 'scene', scene: 'death' });
      return next;
    }
    fx.push({
      type: 'toast',
      text: `你熬过了这一年（本次死亡概率 ${Math.round(roll.probability * 100)}%）`,
      tone: 'bad',
    });
  } else if (roll.warning) {
    fx.push({ type: 'toast', text: '身体越来越差了', tone: 'bad' });
  }

  const age = db.rules.startAge + next.cycle;
  if (age >= db.rules.endAge) {
    next.status = 'ended';
    next.ending = {
      kind: 'age',
      title: '寿终',
      text: `你在 ${db.rules.endAge} 岁那年合上了眼。这一世没能解开你想解开的东西，但你已经把能走的路都走过了。`,
    };
    fx.push({ type: 'scene', scene: 'ending' });
    return next;
  }

  return next;
}

function pushLog(run: RunState, text: string, kind: LogEntry['kind']): void {
  run.log.push({ cycle: run.cycle, text, kind });
  if (run.log.length > 200) run.log = run.log.slice(-200);
}

function deathFlavor(db: ContentDb, run: RunState): string {
  const age = db.rules.startAge + run.cycle;
  const karma = getAttr(run, db.karmaId);
  const tone =
    karma >= 60
      ? '你这一生善待过许多人。'
      : karma <= -60
        ? '你这一生没少做亏心事。'
        : '你这一生有对有错，说不上好，也说不上坏。';
  return `${age} 岁，你倒下了。${tone}死亡不是终点——只是这一段记忆到此为止。`;
}

// ---------------------------------------------------------------- 元存档

export function commitMeta(db: ContentDb, run: RunState, meta: MetaState): MetaState {
  const karma = getAttr(run, db.karmaId);
  const carried = Math.round(karma * db.rules.karma.carryover);
  const knowledge = [...meta.knowledge];
  for (const k of run.knowledge) if (!knowledge.includes(k)) knowledge.push(k);

  const endings = [...meta.endings];
  if (run.ending && !endings.includes(run.ending.title)) endings.push(run.ending.title);

  return {
    ...meta,
    lives: meta.lives + 1,
    karmaTotal: Math.max(-100, Math.min(100, meta.karmaTotal + carried)),
    knowledge,
    endings,
    bestProgress: Math.max(meta.bestProgress, run.progress),
    uniqueSeen: Array.from(new Set([...meta.uniqueSeen, ...run.seen])),
  };
}

// ---------------------------------------------------------------- 给 UI 的查询

export interface OptionView {
  index: number;
  text: string;
  visible: boolean;
  chance: number | null;
  requirementText: string[];
}

export function viewOptions(db: ContentDb, run: RunState): OptionView[] {
  const p = run.pending;
  if (!p) return [];
  const ev = db.eventById.get(p.eventId);
  if (!ev) return [];
  return ev.options.map((opt: EventOption, i: number) => ({
    index: i,
    text: opt.text,
    visible: meetsAll(db, run, opt.requires),
    chance: opt.check ? checkChance(db, run, opt.check.attr, opt.check.dc) : null,
    requirementText: (opt.requires ?? []).map((r: Requirement) => describeRequirement(db, r)),
  }));
}

export function hashText(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type { Ending };
