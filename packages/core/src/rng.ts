/**
 * 确定性随机数。
 *
 * 关键规则：不要用一条全局的消费流。每个随机需求都从 (seed, 上下文) 派生
 * 一个独立的流，这样"在中间插入一个新事件"不会改变后面所有结果。
 * 存档里只需要 seed + 计数器，就能完整复现一局。
 */

/** mulberry32：状态是一个 32 位整数，可直接序列化 */
export function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32 位字符串哈希 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 由 seed 和若干上下文片段派生一个稳定种子 */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  let h = seed >>> 0;
  for (const p of parts) {
    h = (h ^ hashString(String(p))) >>> 0;
    h = Math.imul(h, 0x9e3779b1) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  private readonly next: () => number;

  constructor(state: number) {
    this.next = mulberry32(state);
  }

  /** [0, 1) */
  float(): number {
    return this.next();
  }

  /** [0, n) 的整数 */
  int(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  }

  /** [min, max] 闭区间整数 */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** 以 p 的概率返回 true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[this.int(arr.length)];
  }

  /** 按权重抽取。权重必须为非负数，全 0 时返回 undefined */
  weighted<T>(arr: readonly T[], weightOf: (t: T) => number): T | undefined {
    let total = 0;
    for (const t of arr) total += Math.max(0, weightOf(t));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const t of arr) {
      r -= Math.max(0, weightOf(t));
      if (r < 0) return t;
    }
    return arr[arr.length - 1];
  }

  /** 原地洗牌（Fisher-Yates），返回同一个数组 */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = a;
    }
    return arr;
  }
}

/** 派生子流的便捷入口 */
export function rngAt(seed: number, ...parts: (string | number)[]): Rng {
  return new Rng(deriveSeed(seed, ...parts));
}
