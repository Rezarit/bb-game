import type { ContentDb } from '@core/types.js';
import type { MetaState, RunState } from '@core/state.js';
import { getAttr, tierName } from '@core/rules.js';

export function EndScreen({
  db,
  run,
  meta,
  onNextLife,
}: {
  db: ContentDb;
  run: RunState;
  meta: MetaState;
  onNextLife: () => void;
}) {
  const end = run.ending;
  const karma = getAttr(run, db.karmaId);
  const karmaDef = db.attrs.find((a) => a.id === db.karmaId)!;
  const tier = tierName(karmaDef, karma) ?? '';
  const carried = Math.round(karma * db.rules.karma.carryover);
  const nextKarma = Math.max(-100, Math.min(100, meta.karmaTotal + carried));

  const bonus = Math.floor(Math.max(0, nextKarma) / db.rules.karma.statBonusDivisor);
  const penalty = Math.floor(Math.max(0, -nextKarma) / db.rules.karma.statPenaltyDivisor);

  if (!end) return null;

  return (
    <div className="screen">
      <div className="end-card">
        <div className="end-kind">{end.kind === 'death' ? '第 ' + run.life + ' 世 · 终' : '第 ' + run.life + ' 世 · 终'}</div>
        <div className="end-title">{end.title}</div>
        <div className="end-text">{end.text}</div>

        {run.highlights.length > 0 && (
          <div className="end-highlights">
            <h4>你这一世做过的选择</h4>
            <ul>
              {run.highlights.slice(-8).map((h, i) => (
                <li key={i}>
                  <span className="cy">{db.rules.startAge + h.cycle}岁</span>
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="end-karma">
          这一世你走到了 <b>{tier}</b>（{karma > 0 ? '+' : ''}{karma}）。
          <br />
          {carried > 0 && <>其中有 {carried} 点会留在你身上。</>}
          {carried < 0 && <>其中有 {carried} 点会留在你身上。</>}
          {carried === 0 && <>什么也没留下。</>}
          <br />
          <br />
          下一世，你的善恶是 <b>{nextKarma > 0 ? '+' : ''}{nextKarma}</b>。
          {bonus > 0 && <>五维各自 <b>+{bonus}</b>。</>}
          {penalty > 0 && <>五维各自 <b>-{penalty}</b>，但负面的伤害会减轻约 <b>{Math.round((Math.min(100, -nextKarma) / 100) * db.rules.karma.penaltyReduction * 100)}%</b>。</>}
          {bonus === 0 && penalty === 0 && <>这一点还不足以改变什么。</>}
        </div>

        <button className="btn primary" onClick={onNextLife} style={{ padding: '10px 32px' }}>
          进入第 {run.life + 1} 世
        </button>
      </div>
    </div>
  );
}

export function TitleScreen({
  meta,
  hasSave,
  onNew,
  onContinue,
}: {
  meta: MetaState;
  hasSave: boolean;
  onNew: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="title-screen">
      <div className="title-head">
        <div className="title-word">轮回</div>
        <div className="title-sub">每一次死亡，都通往新的世界线</div>
      </div>
      <div className="title-actions">
        {hasSave && (
          <button className="btn primary" onClick={onContinue}>
            继续这一世
          </button>
        )}
        <button className={hasSave ? 'btn' : 'btn primary'} onClick={onNew}>
          {meta.lives > 0 ? '开始新的轮回' : '开始'}
        </button>
      </div>
      <div className="title-meta">
        {meta.lives > 0 ? (
          <>
            已轮回 {meta.lives} 世 · 累计善恶 {meta.karmaTotal > 0 ? '+' : ''}
            {meta.karmaTotal}
            <br />
            {meta.endings.length > 0 && `见过的终局：${meta.endings.join('、')}`}
          </>
        ) : (
          <>这是你的第一世。</>
        )}
      </div>
    </div>
  );
}
