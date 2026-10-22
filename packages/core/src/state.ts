import type { ContentDb, EventDef, EventOption, Outcome } from './types.js';

/** 一局内的运行状态。可以整体序列化进存档。 */
export interface RunState {
  seed: number;
  /** 第几世，从 1 开始 */
  life: number;
  /** 当前周期，0 表示开局那一年 */
  cycle: number;
  /** 所有属性的当前值，键来自 attrs.yaml */
  attrs: Record<string, number>;
  flags: string[];
  knowledge: string[];
  /** 宿命推进度 0..100 */
  progress: number;
  /** 格子 id -> 这一局随机到的地点 id */
  locations: Record<string, string>;
  /** 玩家当前所在的格子 id */
  at: string;
  /** 到过的格子（迷雾用） */
  visited: string[];
  /** 当前周期的剩余体力 */
  energy: number;
  /** 已触发过的事件 id（once） */
  seen: string[];
  /** 正在展示的事件，null 表示在地图上 */
  pending: PendingEvent | null;
  /** 周期结束时会话，给 UI 播放 */
  log: LogEntry[];
  status: 'playing' | 'dead' | 'ended';
  /** 死亡或结局的原因 */
  ending: Ending | null;
  /** 这一世做过的关键选择，用于结算页回放 */
  highlights: Highlight[];
}

export interface Ending {
  kind: 'death' | 'age' | 'fate' | 'false-ending' | 'true-ending';
  title: string;
  text: string;
}

export interface Highlight {
  cycle: number;
  text: string;
}

export interface LogEntry {
  cycle: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'karma';
}

export interface PendingEvent {
  eventId: string;
  /**
   * 这个事件结束后做什么：
   *   true     立刻结束这一年（"在家待着"这类行动）
   *   'ending' 进入结局画面（宿命终局）
   */
  endAfter?: boolean | 'ending';
  /** 已经展示过的选项结果 */
  resolved: null | {
    optionIndex: number;
    outcome: Outcome;
    /** 检定结果，无检定则为 null */
    check: null | { attr: string; dc: number; roll: number; success: boolean };
  };
}

/** 跨周目保留的数据，绝对不能丢。 */
export interface MetaState {
  /** 存档结构版本，改结构时必须 +1 并写迁移 */
  schemaVersion: number;
  /** 累计游玩世数 */
  lives: number;
  /** 累计善恶（历史上每一世的善恶魔数加权累积） */
  karmaTotal: number;
  /** 解锁的知识（跨周目） */
  knowledge: string[];
  /** 已达成结局的记录 */
  endings: string[];
  /** 最佳进度 */
  bestProgress: number;
  /** 跨周目只触发一次的事件 id */
  uniqueSeen: string[];
}

export const META_SCHEMA_VERSION = 1;

export function emptyMeta(): MetaState {
  return {
    schemaVersion: META_SCHEMA_VERSION,
    lives: 0,
    karmaTotal: 0,
    knowledge: [],
    endings: [],
    bestProgress: 0,
    uniqueSeen: [],
  };
}

// ---------------------------------------------------------------- 选项评估

export interface EvaluatedOption {
  index: number;
  option: EventOption;
  visible: boolean;
  affordable: boolean;
  /** 检定的成功率 0..1，无检定为 null */
  chance: number | null;
  blockedReason: string | null;
}

export function getEvent(db: ContentDb, id: string): EventDef | undefined {
  return db.eventById.get(id);
}
