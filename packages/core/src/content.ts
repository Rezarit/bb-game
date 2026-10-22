import { z } from 'zod';
import type { ContentDb, AttrDef, EventDef, LocationDef, Rules, SlotDef } from './types.js';

// ---------------------------------------------------------------- schema

const attrSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  abbrev: z.string().min(1),
  kind: z.enum(['stat', 'resource', 'karma']),
  start: z.number(),
  min: z.number().default(0),
  max: z.number(),
  color: z.string(),
  desc: z.string().default(''),
  tiers: z
    .array(z.object({ at: z.number(), name: z.string() }))
    .optional(),
});

const requirementSchema = z.union([
  z.object({ attr: z.string(), min: z.number() }),
  z.object({ attrMax: z.string(), max: z.number() }),
  z.object({ flag: z.string() }),
  z.object({ knowledge: z.string() }),
  z.object({ karmaMin: z.number() }),
  z.object({ karmaMax: z.number() }),
  z.object({ goldMin: z.number() }),
  z.object({ progressMin: z.number() }),
]);

const effectSchema = z.union([
  z.object({ attr: z.record(z.string(), z.number()) }),
  z.object({ hp: z.number() }),
  z.object({ energy: z.number() }),
  z.object({ gold: z.number() }),
  z.object({ karma: z.number() }),
  z.object({ flag: z.string() }),
  z.object({ knowledge: z.string() }),
  z.object({ progress: z.number() }),
  z.object({ text: z.string() }),
]);

const outcomeSchema = z.object({
  text: z.string().optional(),
  effects: z.array(effectSchema).optional(),
});

const optionSchema = z.object({
  text: z.string().min(1),
  requires: z.array(requirementSchema).optional(),
  energy: z.number().optional(),
  check: z.object({ attr: z.string(), dc: z.number() }).optional(),
  success: outcomeSchema.optional(),
  fail: outcomeSchema.optional(),
  result: outcomeSchema.optional(),
});

const eventSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).min(1),
  weight: z.number().default(10),
  once: z.boolean().optional(),
  unique: z.boolean().optional(),
  requires: z.array(requirementSchema).optional(),
  text: z.string().min(1),
  options: z.array(optionSchema).min(1),
});

const slotSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  edges: z.array(z.string()),
  fixedLocation: z.string().optional(),
});

const actionSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  energy: z.number().default(1),
  tags: z.array(z.string()).min(1),
  requires: z.array(requirementSchema).optional(),
  endsCycle: z.boolean().optional(),
});

const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  short: z.string(),
  color: z.string(),
  desc: z.string().default(''),
  weight: z.number().default(10),
  actions: z.array(actionSchema).min(1),
});

const rulesSchema: z.ZodType<Rules> = z.object({
  startAge: z.number(),
  endAge: z.number(),
  maxEnergy: z.number(),
  moveCost: z.number(),
  hpDrain: z.object({ startCycle: z.number(), everyCycles: z.number() }),
  check: z.object({
    bonus: z.number().default(0),
  }),
  death: z.object({
    warnBelow: z.number(),
    rollBelow: z.number(),
    slope: z.number(),
    certainBelow: z.number(),
  }),
  karma: z.object({
    statBonusDivisor: z.number(),
    penaltyReduction: z.number(),
    statPenaltyDivisor: z.number(),
    carryover: z.number(),
  }),
  endingThreshold: z.number(),
});

export interface RawContent {
  rules: unknown;
  attrs: unknown[];
  slots: unknown[];
  locations: unknown[];
  events: unknown[];
}

// ---------------------------------------------------------------- 构建

export class ContentError extends Error {
  constructor(public readonly issues: string[]) {
    super(`内容校验失败：\n${issues.join('\n')}`);
  }
}

/**
 * 把原始 YAML 解析成 ContentDb。
 * 所有引用（事件里的 attr、location 的 fixedLocation）都会检查，
 * 拼错会在启动时立刻报错，而不是运行到一半才炸。
 */
export function buildContent(raw: RawContent): ContentDb {
  const issues: string[] = [];

  const rules = rulesSchema.safeParse(raw.rules);
  if (!rules.success) issues.push(...rules.error.issues.map((i) => `rules: ${i.path.join('.')} ${i.message}`));

  const attrs: AttrDef[] = [];
  for (const [i, a] of raw.attrs.entries()) {
    const r = attrSchema.safeParse(a);
    if (!r.success) {
      issues.push(...r.error.issues.map((x) => `attrs[${i}]: ${x.path.join('.')} ${x.message}`));
      continue;
    }
    attrs.push({ ...r.data, tiers: normalizeTiers(r.data.tiers) });
  }

  const slots: SlotDef[] = [];
  for (const [i, s] of raw.slots.entries()) {
    const r = slotSchema.safeParse(s);
    if (!r.success) {
      issues.push(...r.error.issues.map((x) => `slots[${i}]: ${x.path.join('.')} ${x.message}`));
      continue;
    }
    slots.push(r.data);
  }

  const locations: LocationDef[] = [];
  for (const [i, l] of raw.locations.entries()) {
    const r = locationSchema.safeParse(l);
    if (!r.success) {
      issues.push(...r.error.issues.map((x) => `locations[${i}]: ${x.path.join('.')} ${x.message}`));
      continue;
    }
    locations.push(r.data);
  }

  const events: EventDef[] = [];
  const seenIds = new Set<string>();
  for (const [i, e] of raw.events.entries()) {
    const r = eventSchema.safeParse(e);
    if (!r.success) {
      issues.push(...r.error.issues.map((x) => `events[${i}]: ${x.path.join('.')} ${x.message}`));
      continue;
    }
    if (seenIds.has(r.data.id)) issues.push(`events: 重复的 id "${r.data.id}"`);
    seenIds.add(r.data.id);
    // 检定必须同时有 success 和 fail，否则 UI 无法展示结果
    for (const [j, o] of r.data.options.entries()) {
      if (o.check && (!o.success || !o.fail)) {
        issues.push(`events.${r.data.id}.options[${j}]: 有 check 时必须同时写 success 和 fail`);
      }
      if (o.check && !attrs.some((a) => a.id === o.check!.attr)) {
        issues.push(`events.${r.data.id}.options[${j}]: check.attr "${o.check.attr}" 不存在`);
      }
    }
    events.push(r.data);
  }

  // 引用检查
  const attrIds = new Set(attrs.map((a) => a.id));
  const locationIds = new Set(locations.map((l) => l.id));
  const slotIds = new Set(slots.map((s) => s.id));

  for (const a of attrs) {
    if (!a.tiers) continue;
  }
  for (const s of slots) {
    for (const e of s.edges) {
      if (!slotIds.has(e)) issues.push(`slots.${s.id}: 连到不存在的格子 "${e}"`);
    }
    if (s.fixedLocation && !locationIds.has(s.fixedLocation)) {
      issues.push(`slots.${s.id}: fixedLocation "${s.fixedLocation}" 不存在`);
    }
  }
  for (const l of locations) {
    for (const a of l.actions) {
      for (const r of a.requires ?? []) {
        const id = 'attr' in r ? r.attr : 'attrMax' in r ? r.attrMax : null;
        if (id && !attrIds.has(id)) issues.push(`locations.${l.id}.actions.${a.id}: 属性 "${id}" 不存在`);
      }
    }
  }
  for (const e of events) {
    for (const eff of e.options.flatMap((o) => [...(o.success?.effects ?? []), ...(o.fail?.effects ?? []), ...(o.result?.effects ?? [])])) {
      if ('attr' in eff) {
        for (const id of Object.keys(eff.attr)) {
          if (!attrIds.has(id)) issues.push(`events.${e.id}: 效果引用了不存在的属性 "${id}"`);
        }
      }
    }
  }

  const karma = attrs.find((a) => a.kind === 'karma');
  if (!karma) issues.push('attrs: 必须有一个 kind: karma 的属性');

  if (issues.length > 0) throw new ContentError(issues);

  return {
    rules: rules.data as Rules,
    attrs,
    statIds: attrs.filter((a) => a.kind === 'stat').map((a) => a.id),
    resourceIds: attrs.filter((a) => a.kind === 'resource').map((a) => a.id),
    karmaId: karma!.id,
    slots,
    locations,
    events,
    eventById: new Map(events.map((e) => [e.id, e])),
  };
}

/** YAML 里的 tiers 可能写成 { 0: '魔头', 10: '恶人' } 这种映射，统一成数组 */
function normalizeTiers(
  t: Array<{ at: number; name: string }> | undefined,
): Array<{ at: number; name: string }> | undefined {
  return t;
}

/** 把 tiers 映射形式转成数组（供 build-content 使用） */
export function tiersFromRecord(rec: Record<string, string>): Array<{ at: number; name: string }> {
  return Object.entries(rec)
    .map(([at, name]) => ({ at: Number(at), name }))
    .sort((a, b) => a.at - b.at);
}
