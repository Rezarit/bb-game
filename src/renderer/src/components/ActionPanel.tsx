import type { ContentDb } from '@core/types.js';
import type { RunState } from '@core/state.js';
import { getAttr, meetsAll } from '@core/rules.js';

interface Props {
  db: ContentDb;
  run: RunState;
  onAct: (actionId: string) => void;
}

export function ActionPanel({ db, run, onAct }: Props) {
  const loc = db.locations.find((l) => l.id === run.locations[run.at]);
  if (!loc) return null;

  return (
    <div className="actions">
      <div className="actions-head">
        <h3>{loc.name}</h3>
        <span className="loc-desc">{loc.desc}</span>
      </div>
      <div className="action-list">
        {loc.actions.map((a) => {
          const allowed = meetsAll(db, run, a.requires);
          const affordable = run.energy >= a.energy;
          return (
            <button
              key={a.id}
              className="btn"
              disabled={!allowed || !affordable}
              title={a.desc || a.name}
              onClick={() => onAct(a.id)}
            >
              {a.name}
              <span className="cost">体力 {a.energy}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 顶栏：年龄、体力 */
export function TopBar({
  db,
  run,
  onEndCycle,
}: {
  db: ContentDb;
  run: RunState;
  onEndCycle: () => void;
}) {
  const age = db.rules.startAge + run.cycle;
  const energy = getAttr(run, 'energy');

  return (
    <div className="topbar">
      <span className="age">{age} 岁</span>
      <span className="cycle-hint">第 {run.life} 世</span>
      <span className="spacer" />
      <span>
        体力 <strong style={{ color: 'var(--accent)' }}>{run.energy}</strong>
        <span style={{ color: 'var(--text-faint)' }}> / {energy}</span>
      </span>
      <button className="btn primary" onClick={onEndCycle}>
        结束这一年 →
      </button>
    </div>
  );
}
