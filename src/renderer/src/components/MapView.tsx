import type { ContentDb, LocationDef, SlotDef } from '@core/types.js';
import type { RunState } from '@core/state.js';

interface Props {
  db: ContentDb;
  run: RunState;
  onMove: (slot: string) => void;
}

export function MapView({ db, run, onMove }: Props) {
  const here = run.at;
  const currentSlot = db.slots.find((s) => s.id === here);
  const reachable = new Set(currentSlot?.edges ?? []);

  // 迷雾：只显示到过的格子和它们的直接邻居
  const known = new Set<string>(run.visited ?? []);
  known.add(here);
  for (const e of reachable) known.add(e);

  return (
    <div className="map-wrap">
      <div className="map-grid">
        <svg className="map-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
          {db.slots.flatMap((s) =>
            s.edges
              .filter((e) => s.id < e)
              .map((e) => {
                const to = db.slots.find((x) => x.id === e);
                if (!to) return null;
                // 两端都没到过，不画线
                if (!known.has(s.id) && !known.has(e)) return null;
                const active =
                  (s.id === here && reachable.has(e)) || (e === here && s.edges.includes(here));
                return (
                  <line
                    key={`${s.id}-${e}`}
                    x1={s.x}
                    y1={s.y}
                    x2={to.x}
                    y2={to.y}
                    className={`map-edge${active ? ' reachable' : ''}`}
                  />
                );
              }),
          )}
        </svg>
        {db.slots.map((slot) => (
          <SlotNode
            key={slot.id}
            slot={slot}
            loc={db.locations.find((l) => l.id === run.locations[slot.id])}
            here={slot.id === here}
            reachable={reachable.has(slot.id)}
            known={known.has(slot.id)}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
}

function SlotNode({
  slot,
  loc,
  here,
  reachable,
  known,
  onMove,
}: {
  slot: SlotDef;
  loc: LocationDef | undefined;
  here: boolean;
  reachable: boolean;
  known: boolean;
  onMove: (s: string) => void;
}) {
  if (!known) {
    return (
      <div
        className="slot unknown"
        style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={`slot${here ? ' here' : ''}${reachable && !here ? ' reachable' : ''}`}
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
      onClick={() => {
        if (reachable && !here) onMove(slot.id);
      }}
    >
      <div className="slot-shape" style={{ background: loc?.color ?? '#333' }} />
      <div className="slot-name">{loc?.short ?? '？？'}</div>
      <div className="slot-desc">{here ? loc?.name : ''}</div>
    </div>
  );
}
