import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentDb } from '@core/types.js';
import type { MetaState, RunState } from '@core/state.js';
import { emptyMeta } from '@core/state.js';
import { createRun, reduce, type Action, type FxEvent } from '@core/reducer.js';

export interface FxBus {
  emit: (fx: FxEvent) => void;
  subscribe: (fn: (fx: FxEvent) => void) => () => void;
}

function makeBus(): FxBus {
  const listeners = new Set<(fx: FxEvent) => void>();
  return {
    emit: (fx) => listeners.forEach((l) => l(fx)),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** 全局 fx 总线。Phaser 层将来只要订阅这个，不需要知道 DOM 的存在。 */
export const fxBus = makeBus();

const SAVE_SLOT_META = 'meta';
const SAVE_SLOT_RUN = 'run';

interface SaveApi {
  write(slot: string, data: string): Promise<boolean>;
  read(slot: string): Promise<string | null>;
  remove(slot: string): Promise<boolean>;
}

function saveApi(): SaveApi | null {
  return (globalThis as unknown as { saveApi?: SaveApi }).saveApi ?? null;
}

export type GamePhase = 'title' | 'playing' | 'ended';

export interface GameStore {
  db: ContentDb;
  phase: GamePhase;
  run: RunState | null;
  meta: MetaState;
  dispatch: (a: Action) => void;
  startNew: () => void;
  continueRun: () => void;
  abandonRun: () => void;
  nextLife: () => void;
  hasSave: boolean;
}

export function useGame(db: ContentDb): GameStore {
  const [phase, setPhase] = useState<GamePhase>('title');
  const [run, setRun] = useState<RunState | null>(null);
  const [meta, setMeta] = useState<MetaState>(emptyMeta);
  const [hasSave, setHasSave] = useState(false);
  const loaded = useRef(false);

  // ---- 启动时读档
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const api = saveApi();
    if (!api) return;
    void (async () => {
      const metaJson = await api.read(SAVE_SLOT_META);
      if (metaJson) {
        try {
          setMeta(migrateMeta(JSON.parse(metaJson) as MetaState));
        } catch {
          /* 损坏的元存档直接忽略，不阻塞启动 */
        }
      }
      const runJson = await api.read(SAVE_SLOT_RUN);
      setHasSave(Boolean(runJson));
    })();
  }, []);

  // ---- 自动存档
  useEffect(() => {
    const api = saveApi();
    if (!api) return;
    void api.write(SAVE_SLOT_META, JSON.stringify(meta));
  }, [meta]);

  useEffect(() => {
    const api = saveApi();
    if (!api) return;
    if (run && phase === 'playing') {
      void api.write(SAVE_SLOT_RUN, JSON.stringify(run));
      setHasSave(true);
    }
  }, [run, phase]);

  const dispatch = useCallback(
    (a: Action) => {
      if (!run) return;
      const res = reduce(db, run, meta, a);
      setRun(res.run);
      setMeta(res.meta);
      for (const fx of res.fx) fxBus.emit(fx);
      if (res.run.status !== 'playing') {
        setPhase('ended');
        // 这一世结束，本地 run 存档作废
        void saveApi()?.remove(SAVE_SLOT_RUN);
        setHasSave(false);
      }
    },
    [run, meta, db],
  );

  const newRun = useCallback(
    (m: MetaState) => {
      const seed = (Date.now() ^ Math.imul(m.lives + 1, 0x9e3779b1)) >>> 0;
      const r = createRun(db, m, seed);
      setRun(r);
      setPhase('playing');
      fxBus.emit({ type: 'scene', scene: 'map' });
    },
    [db],
  );

  const startNew = useCallback(() => {
    newRun(meta);
  }, [newRun, meta]);

  const continueRun = useCallback(() => {
    const api = saveApi();
    if (!api) return;
    void (async () => {
      const json = await api.read(SAVE_SLOT_RUN);
      if (!json) return;
      try {
        const r = JSON.parse(json) as RunState;
        // pending 事件不恢复，避免半个事件卡住
        setRun({ ...r, pending: null });
        setPhase(r.status === 'playing' ? 'playing' : 'ended');
      } catch {
        setHasSave(false);
      }
    })();
  }, []);

  const abandonRun = useCallback(() => {
    void saveApi()?.remove(SAVE_SLOT_RUN);
    setHasSave(false);
    setRun(null);
    setPhase('title');
  }, []);

  const nextLife = useCallback(() => {
    if (!run) return;
    const res = reduce(db, run, meta, { t: 'nextLife' });
    setRun(res.run);
    setMeta(res.meta);
    setPhase('playing');
    for (const fx of res.fx) fxBus.emit(fx);
  }, [run, meta, db]);

  return {
    db,
    phase,
    run,
    meta,
    dispatch,
    startNew,
    continueRun,
    abandonRun,
    nextLife,
    hasSave,
  };
}

/** 元存档迁移。以后改结构时在这里加分支，老档必须能读。 */
export function migrateMeta(m: MetaState): MetaState {
  let out = m;
  if ((out.schemaVersion ?? 0) < 1) {
    out = { ...emptyMeta(), ...out, schemaVersion: 1 };
  }
  if (!out.uniqueSeen) out = { ...out, uniqueSeen: [] };
  return out;
}
