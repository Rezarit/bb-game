import { useEffect, useState, useSyncExternalStore } from 'react';
import type { FxEvent } from '@core/reducer.js';
import { fxBus } from './store.js';

// ---------------------------------------------------------------- fx 订阅

export function useFx(handler: (fx: FxEvent) => void) {
  useEffect(() => fxBus.subscribe(handler), [handler]);
}

interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

let toastId = 0;

/** 收集 toast 与闪白，供 App 渲染 */
export function useFxLayer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<{ id: number; color: string } | null>(null);
  const [shake, setShake] = useState(0);

  useEffect(
    () =>
      fxBus.subscribe((fx) => {
        if (fx.type === 'toast') {
          const id = ++toastId;
          setToasts((t) => [...t, { id, text: fx.text, tone: fx.tone }]);
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
        } else if (fx.type === 'flash') {
          setFlash({ id: ++toastId, color: fx.color });
          setTimeout(() => setFlash(null), 420);
        } else if (fx.type === 'shake') {
          setShake(fx.intensity);
          setTimeout(() => setShake(0), 300);
        }
      }),
    [],
  );

  return { toasts, flash, shake };
}

/** 订阅某个随 dispatch 变化的快照（简单实现，足够用） */
export function useForceUpdate() {
  const [, set] = useState(0);
  return () => set((n) => n + 1);
}

export { useSyncExternalStore };
