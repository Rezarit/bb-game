/**
 * 把 packages/content/content/*.yaml 编译成 generated/content.json。
 *
 * 这一步会做完整校验：引用不存在的属性、事件 id 重复、
 * 检定缺 success/fail、格子连到不存在的邻居……全部在构建时炸掉，
 * 而不是等到玩到一半。
 *
 * 用法：npm run content
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { buildContent, tiersFromRecord, ContentError } from '../packages/core/src/content.js';

const root = resolve(import.meta.dirname, '..');
const contentDir = join(root, 'packages/content/content');
const outDir = join(root, 'packages/content/generated');

function readYaml(file: string): unknown {
  return parse(readFileSync(file, 'utf8'));
}

function main() {
  // ---- rules
  const rules = readYaml(join(contentDir, 'rules.yaml'));

  // ---- attrs：三个小节合并成一个数组
  const attrsRaw = readYaml(join(contentDir, 'attrs.yaml')) as {
    attributes?: unknown[];
    resources?: unknown[];
    karma?: unknown;
  };

  const attrs: unknown[] = [...(attrsRaw.attributes ?? []), ...(attrsRaw.resources ?? [])];
  if (attrsRaw.karma) {
    const k = attrsRaw.karma as Record<string, unknown>;
    // tiers 支持两种写法：
    //   映射  { 85: 圣人, 60: 善人, ... }
    //   数组  [{ at: 85, name: 圣人 }, ...]
    const t = k.tiers;
    const tiers = Array.isArray(t)
      ? t
      : t && typeof t === 'object'
        ? tiersFromRecord(t as Record<string, string>)
        : undefined;
    attrs.push({ ...k, tiers });
  }

  // ---- slots
  const slotsRaw = readYaml(join(contentDir, 'slots.yaml')) as { slots: unknown[] };

  // ---- locations
  const locRaw = readYaml(join(contentDir, 'locations.yaml'));
  const locations = Array.isArray(locRaw) ? locRaw : (locRaw as { locations: unknown[] }).locations;

  // ---- events：events/ 下所有 yaml 合并
  const eventDir = join(contentDir, 'events');
  const events: unknown[] = [];
  if (existsSync(eventDir)) {
    for (const f of readdirSync(eventDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort()) {
      const parsed = readYaml(join(eventDir, f));
      if (!Array.isArray(parsed)) {
        console.error(`✗ ${f}: 事件文件的顶层必须是数组`);
        process.exit(1);
      }
      events.push(...parsed);
    }
  }

  // ---- 校验 + 构建
  let db;
  try {
    db = buildContent({
      rules,
      attrs,
      slots: slotsRaw.slots,
      locations,
      events,
    });
  } catch (e) {
    if (e instanceof ContentError) {
      console.error('\n✗ 内容校验失败：\n');
      for (const issue of e.issues) console.error('  · ' + issue);
      console.error(`\n共 ${e.issues.length} 个问题。\n`);
      process.exit(1);
    }
    throw e;
  }

  // ---- 输出
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'content.json'), JSON.stringify({
    rules: db.rules,
    attrs: db.attrs,
    slots: db.slots,
    locations: db.locations,
    events: db.events,
  }, null, 2));

  // 生成 id 常量，给 TS 自动补全用
  const ids = [
    '// 自动生成，请勿手改。来源：packages/content/content/*.yaml',
    '',
    'export const ATTR_IDS = ' + JSON.stringify(db.attrs.map((a) => a.id)) + ' as const;',
    'export type AttrId = (typeof ATTR_IDS)[number];',
    '',
    'export const STAT_IDS = ' + JSON.stringify(db.statIds) + ' as const;',
    'export const LOCATION_IDS = ' + JSON.stringify(db.locations.map((l) => l.id)) + ' as const;',
    'export const SLOT_IDS = ' + JSON.stringify(db.slots.map((s) => s.id)) + ' as const;',
    'export const EVENT_IDS = ' + JSON.stringify(db.events.map((e) => e.id)) + ' as const;',
    '',
    'export const KARMA_ID = ' + JSON.stringify(db.karmaId) + ';',
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'ids.ts'), ids);

  // ---- 统计
  const tagCount = new Map<string, number>();
  for (const e of db.events) for (const t of e.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);

  console.log('✓ 内容构建完成');
  console.log(`  属性 ${db.attrs.length} · 地点 ${db.locations.length} · 事件 ${db.events.length}`);
  console.log('  事件标签分布：');
  for (const [t, n] of [...tagCount].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(12)} ${n}`);
  }
  const emptyTags = new Set<string>();
  for (const l of db.locations) for (const a of l.actions) for (const t of a.tags) {
    if (!tagCount.has(t)) emptyTags.add(t);
  }
  if (emptyTags.size > 0) {
    console.log(`  ⚠ 这些标签没有任何事件，行动会空过：${[...emptyTags].join(', ')}`);
  }
}

main();
