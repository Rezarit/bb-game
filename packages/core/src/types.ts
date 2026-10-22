/**
 * 游戏数据的类型定义。
 *
 * 这一层只描述"内容长什么样"，不含任何逻辑，也不 import 任何框架。
 * 所有具体内容（属性、地点、事件）都来自 packages/content 的 YAML。
 */

// ---------------------------------------------------------------- 属性

export type AttrKind = 'stat' | 'resource' | 'karma';

export interface AttrTier {
  /** 阈值：数值 >= at 时显示这个名称。按 at 降序匹配。 */
  at: number;
  name: string;
}

export interface AttrDef {
  id: string;
  name: string;
  abbrev: string;
  kind: AttrKind;
  start: number;
  min: number;
  max: number;
  color: string;
  desc: string;
  tiers?: AttrTier[];
}

// ---------------------------------------------------------------- 规则

export interface Rules {
  /** 开局年龄 */
  startAge: number;
  /** 到这个年龄强制结束（自然寿终） */
  endAge: number;
  /** 每个周期（一年）开始时体力回满到这个值 */
  maxEnergy: number;
  /** 移动到相邻地点消耗的体力 */
  moveCost: number;

  /** 每周期结束时自然流失的生命，做成年纪越大越快 */
  hpDrain: {
    /** 这个周期之前不流失 */
    startCycle: number;
    /** 每过这么多周期，流失量 +1 */
    everyCycles: number;
  };

  /**
   * 检定：掷 d20 + 属性 >= 难度。
   * 成功率由 rules.ts 的 checkChance 精确计算，不在这里配置。
   */
  check: {
    /** 以后的熟练加值之类，暂时不用 */
    bonus: number;
  };

  /** 低血量死亡判定 */
  death: {
    /** 生命比例低于此值时，UI 出现警告 */
    warnBelow: number;
    /** 生命比例低于此值时开始每周期掷骰 */
    rollBelow: number;
    /** 概率 = (rollBelow - 生命比例) * slope */
    slope: number;
    /** 生命比例低于此值时必死 */
    certainBelow: number;
  };

  /** 善恶如何影响下一世 */
  karma: {
    /** 上一世善值每这么多点，五项属性各 +1 */
    statBonusDivisor: number;
    /** 恶值达到 -100 时，负面效果打折到 (1 - penaltyReduction) */
    penaltyReduction: number;
    /** 上一世恶值每这么多点，五项属性各 -1 */
    statPenaltyDivisor: number;
    /** 死亡时，本世善恶按这个比例累积到元存档 */
    carryover: number;
  };

  /** 宿命进度达到这个值才允许触发最终事件 */
  endingThreshold: number;
}

// ---------------------------------------------------------------- 地图

/** 地图上的一个固定格子 */
export interface SlotDef {
  id: string;
  x: number;
  y: number;
  /** 相邻格子 id */
  edges: string[];
  /** 如果指定，这个格子永远是某个地点，不参与随机 */
  fixedLocation?: string;
}

export interface LocationActionDef {
  id: string;
  name: string;
  desc: string;
  /** 消耗体力 */
  energy: number;
  /** 从这个动作能抽到哪些标签的事件 */
  tags: string[];
  /** 需要满足的条件才显示 */
  requires?: Requirement[];
  /** 执行后立刻结束这一年（用于"在家待着"这类跳过时间的行动） */
  endsCycle?: boolean;
}

export interface LocationDef {
  id: string;
  name: string;
  /** 短名，地图格子上显示 */
  short: string;
  color: string;
  desc: string;
  /** 随机身份池的权重 */
  weight: number;
  actions: LocationActionDef[];
}

// ---------------------------------------------------------------- 条件

export type Requirement =
  | { attr: string; min: number }
  | { attrMax: string; max: number }
  | { flag: string }
  | { knowledge: string }
  | { karmaMin: number }
  | { karmaMax: number }
  | { goldMin: number }
  | { progressMin: number };

// ---------------------------------------------------------------- 效果

export interface Outcome {
  /** 结果叙述，可为空 */
  text?: string;
  effects?: Effect[];
}

export type Effect =
  | { attr: Record<string, number> }
  | { hp: number }
  | { energy: number }
  | { gold: number }
  | { karma: number }
  | { flag: string }
  | { knowledge: string }
  | { progress: number }
  | { text: string };

export interface EventOption {
  text: string;
  /** 不满足则不显示这个选项 */
  requires?: Requirement[];
  /** 额外消耗体力（动作本身已消耗过的不重复算） */
  energy?: number;
  /** 有 check 就是检定，否则直接走 result */
  check?: { attr: string; dc: number };
  success?: Outcome;
  fail?: Outcome;
  result?: Outcome;
}

export interface EventDef {
  id: string;
  title?: string;
  /** 出现在哪些标签的动作池里 */
  tags: string[];
  weight: number;
  /** 一局内只触发一次 */
  once?: boolean;
  /** 整个游戏只触发一次（跨周目） */
  unique?: boolean;
  requires?: Requirement[];
  text: string;
  options: EventOption[];
}

// ---------------------------------------------------------------- 内容库

export interface ContentDb {
  rules: Rules;
  attrs: AttrDef[];
  /** kind === 'stat' 的 id，按 yaml 顺序 */
  statIds: string[];
  /** kind === 'resource' 的 id */
  resourceIds: string[];
  /** kind === 'karma' 的 id */
  karmaId: string;
  slots: SlotDef[];
  locations: LocationDef[];
  events: EventDef[];
  eventById: Map<string, EventDef>;
}
