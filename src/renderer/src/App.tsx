import { useCallback, useEffect } from 'react';
import type { ContentDb } from '@core/types.js';
import { useGame } from './store.js';
import { useFxLayer } from './fx.js';
import { MapView } from './components/MapView.js';
import { ActionPanel, TopBar } from './components/ActionPanel.js';
import { EventView } from './components/EventView.js';
import { Sidebar } from './components/Sidebar.js';
import { EndScreen, TitleScreen } from './components/Screens.js';
import { fxBus } from './store.js';

export function App({ db }: { db: ContentDb }) {
  const game = useGame(db);
  const { toasts, flash } = useFxLayer();

  // 开发期调试用：让外部脚本能读到当前阶段（截图验证依赖这个）
  useEffect(() => {
    document.body.dataset.phase = game.phase;
    document.body.dataset.cycle = String(game.run?.cycle ?? -1);
    document.body.dataset.status = game.run?.status ?? 'none';
    document.body.dataset.pending = game.run?.pending ? '1' : '0';
  }, [game.phase, game.run]);

  const onMove = useCallback((slot: string) => {
    game.dispatch({ t: 'move', slot });
  }, [game]);

  const onAct = useCallback((actionId: string) => {
    game.dispatch({ t: 'act', actionId });
  }, [game]);

  const onChoose = useCallback((index: number) => {
    game.dispatch({ t: 'choose', index });
  }, [game]);

  const onDismiss = useCallback(() => {
    game.dispatch({ t: 'dismiss' });
  }, [game]);

  const onEndCycle = useCallback(() => {
    if (game.run?.pending) return;
    game.dispatch({ t: 'endCycle' });
  }, [game]);

  if (game.phase === 'title') {
    return (
      <>
        <TitleScreen
          meta={game.meta}
          hasSave={game.hasSave}
          onNew={game.startNew}
          onContinue={game.continueRun}
        />
        <Toasts toasts={toasts} />
        <FlashLayer flash={flash} />
      </>
    );
  }

  if (game.phase === 'ended' && game.run) {
    return (
      <>
        <EndScreen
          db={db}
          run={game.run}
          meta={game.meta}
          onNextLife={game.nextLife}
        />
        <Toasts toasts={toasts} />
        <FlashLayer flash={flash} />
      </>
    );
  }

  const run = game.run;
  if (!run) return null;

  return (
    <>
      <div className="app">
        <div className="main">
          <TopBar db={db} run={run} onEndCycle={onEndCycle} />
          <MapView db={db} run={run} onMove={onMove} />
          <ActionPanel db={db} run={run} onAct={onAct} />
          {run.pending && (
            <EventView db={db} run={run} onChoose={onChoose} onDismiss={onDismiss} />
          )}
        </div>
        <Sidebar db={db} run={run} />
      </div>
      <Toasts toasts={toasts} />
      <FlashLayer flash={flash} />
    </>
  );
}

function Toasts({ toasts }: { toasts: { id: number; text: string; tone: string }[] }) {  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function FlashLayer({ flash }: { flash: { id: number; color: string } | null }) {
  if (!flash) return null;
  return <div key={flash.id} className="flash" style={{ background: flash.color }} />;
}

// 让 Phaser 层以后可以 import 这个来接受特效事件
export { fxBus };
