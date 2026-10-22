import type { ContentDb } from '@core/types.js';
import type { RunState } from '@core/state.js';
import { deathRoll, getAttr, hpRatio, tierName } from '@core/rules.js';

export function Sidebar({ db, run }: { db: ContentDb; run: RunState }) {
  const stats = db.attrs.filter((a) => a.kind === 'stat');
  const hpDef = db.attrs.find((a) => a.id === 'hp')!;
  const hp = getAttr(run, 'hp');
  const ratio = hpRatio(db, run);
  const gold = getAttr(run, 'gold');
  const karma = getAttr(run, db.karmaId);
  const karmaDef = db.attrs.find((a) => a.id === db.karmaId)!;
  const tier = tierName(karmaDef, karma) ?? '';
  const roll = deathRoll(db, run);
  const age = db.rules.startAge + run.cycle;

  return (
    <aside className="sidebar">
      <div className="side-section">
        <div className="hp-block">
          <div className="hp-head">
            <span style={{ color: 'var(--text-dim)' }}>生命</span>
            <span className={`hp-num${ratio <= db.rules.death.warnBelow ? ' danger' : ''}`}>
              {hp} / {hpDef.max}
            </span>
          </div>
          <div className={`hp-bar${roll.warning ? ' warn' : ''}`}>
            <i style={{ width: `${Math.max(0, ratio * 100)}%` }} />
          </div>
          {roll.probability > 0 && (
            <div className="death-risk">
              本年末死亡概率 {Math.round(roll.probability * 100)}%
              {roll.certain && '（必死）'}
            </div>
          )}
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">属性</div>
        {stats.map((a) => {
          const v = getAttr(run, a.id);
          return (
            <div className="stat-row" key={a.id} title={a.desc}>
              <span className="stat-name">{a.name}</span>
              <span className="stat-value" style={{ color: a.color }}>{v}</span>
              <span className="stat-bar">
                <i style={{ width: `${(v / a.max) * 100}%`, background: a.color, opacity: 0.6 }} />
              </span>
            </div>
          );
        })}
        <div className="stat-row" style={{ marginTop: 6 }}>
          <span className="stat-name">金钱</span>
          <span className="stat-value" style={{ color: '#f1c40f' }}>{gold}</span>
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">善恶</div>
        <div className="karma-block">
          <div
            className="karma-tier"
            style={{ color: karma >= 0 ? 'var(--karma-pos)' : 'var(--karma-neg)' }}
          >
            {tier}
            <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>
              {karma > 0 ? '+' : ''}{karma}
            </span>
          </div>
          <div className="karma-axis">
            <div className="karma-marker" style={{ left: `${((karma + 100) / 200) * 100}%` }} />
          </div>
          <div className="karma-scale">
            <span>恶</span>
            <span>中立</span>
            <span>善</span>
          </div>
        </div>
      </div>

      <div className="side-section progress-block">
        <div className="side-title">宿命</div>
        <div className="progress-bar">
          <i style={{ width: `${run.progress}%` }} />
        </div>
        <div className="progress-hint">
          {run.progress < 20 && '一切都还平静。'}
          {run.progress >= 20 && run.progress < 45 && '你隐约觉得有什么不对。'}
          {run.progress >= 45 && run.progress < 70 && '有东西在靠近。'}
          {run.progress >= 70 && '你知道该去哪里了。'}
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">这一世</div>
        <div className="log-list">
          {run.log
            .slice(-8)
            .reverse()
            .map((l, i) => (
              <div className={`log-entry ${l.kind}`} key={i}>
                <span className="log-cycle">{db.rules.startAge + l.cycle}岁</span>
                {l.text}
              </div>
            ))}
          {run.log.length === 0 && (
            <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
              {age} 岁。一切都还没开始。
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
