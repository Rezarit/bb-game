import { useMemo } from 'react';
import type { ContentDb } from '@core/types.js';
import type { RunState } from '@core/state.js';
import { viewOptions } from '@core/reducer.js';
import { getAttr } from '@core/rules.js';

interface Props {
  db: ContentDb;
  run: RunState;
  onChoose: (index: number) => void;
  onDismiss: () => void;
}

export function EventView({ db, run, onChoose, onDismiss }: Props) {
  const pending = run.pending;
  const ev = pending ? db.eventById.get(pending.eventId) : undefined;
  const options = useMemo(() => viewOptions(db, run), [db, run]);

  if (!pending || !ev) return null;

  const resolved = pending.resolved;
  if (resolved) {
    return <EventResult db={db} run={run} ev={ev} resolved={resolved} onDismiss={onDismiss} />;
  }

  return (
    <div className="event-layer">
      <div className="event-card">
        {ev.title && <div className="event-title">{ev.title}</div>}
        <div className="event-text">{ev.text}</div>
        <div className="option-list">
          {options
            .filter((o) => o.visible)
            .map((o) => {
              const isKnowledge = /【.*】/.test(o.text);
              return (
                <button
                  key={o.index}
                  className={`option${isKnowledge ? ' knowledge-opt' : ''}`}
                  onClick={() => onChoose(o.index)}
                >
                  <span className="opt-text">{o.text}</span>
                  {o.chance !== null && (
                    <span className={`chance ${chanceClass(o.chance)}`}>
                      {Math.round(o.chance * 100)}%
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function EventResult({
  db,
  run,
  ev,
  resolved,
  onDismiss,
}: {
  db: ContentDb;
  run: RunState;
  ev: { title?: string; text: string };
  resolved: NonNullable<RunState['pending']>['resolved'] & object;
  onDismiss: () => void;
}) {
  const opt = ev as unknown as { options: { text: string }[] };
  void opt;
  const check = resolved.check;
  const text = resolved.outcome.text ?? '';
  const extraTexts = (resolved.outcome.effects ?? []).flatMap((e) => ('text' in e ? [e.text] : []));

  return (
    <div className="event-layer">
      <div className="event-card result">
        {check && (
          <div className="verdict">
            <span className={check.success ? 'ok' : 'no'}>
              {check.success ? '成功' : '失败'}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>
              {db.attrs.find((a) => a.id === check.attr)?.name ?? check.attr}{' '}
              掷出 {check.roll} + {getAttr(run, check.attr)} vs {check.dc}
            </span>
          </div>
        )}
        <div className="result-text">
          {text}
          {extraTexts.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>
        <div className="event-actions">
          <button className="btn primary" onClick={onDismiss}>
            继续
          </button>
        </div>
      </div>
    </div>
  );
}

function chanceClass(p: number): string {
  if (p >= 0.65) return 'high';
  if (p >= 0.35) return 'mid';
  return 'low';
}
