'use client';
import { useState } from 'react';
import s from '../app/app.module.css';
import { fmt } from '../lib/engine/insights.js';
import { periodLabel } from '../lib/parsers/utils.js';

export default function Summary({ months, findingsTotal, onGoFindings }) {
  const [sel, setSel] = useState(months.length ? months[months.length - 1].month : null);
  if (!months.length) return <div className={`${s.card} ${s.empty}`}>Aún no hay movimientos con fecha para resumir.</div>;
  const m = months.find(x => x.month === sel) || months[months.length - 1];
  const prev = months[months.indexOf(m) - 1];
  const cats = Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const diff = m.income - m.spending;

  return (
    <div>
      <div className={s.monthPicker}>
        {months.map(x => (
          <button key={x.month} className={`${s.chip} ${x.month === m.month ? s.chipActive : ''}`} onClick={() => setSel(x.month)}>
            {periodLabel(x.month)}
          </button>
        ))}
      </div>

      {findingsTotal > 0 && (
        <button className={`${s.card}`} onClick={onGoFindings} style={{ width: '100%', textAlign: 'left', marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
          <div className={s.tileLabel}>Encontré cobros que puedes reclamar o evitar</div>
          <div className={s.tileValue}>{fmt(findingsTotal)} →</div>
        </button>
      )}

      <div className={s.tiles}>
        <div className={s.card}>
          <div className={s.tileLabel}>Entró</div>
          <div className={s.tileValue}>{fmt(m.income)}</div>
          {prev && <div className={s.tileSub}>{periodLabel(prev.month)}: {fmt(prev.income)}</div>}
        </div>
        <div className={s.card}>
          <div className={s.tileLabel}>Gastaste</div>
          <div className={s.tileValue}>{fmt(m.spending)}</div>
          {prev && <div className={s.tileSub}>{periodLabel(prev.month)}: {fmt(prev.spending)}</div>}
        </div>
        <div className={s.card}>
          <div className={s.tileLabel}>Diferencia</div>
          <div className={`${s.tileValue} ${diff >= 0 ? s.pos : s.neg}`}>{fmt(diff)}</div>
          <div className={s.tileSub}>{diff >= 0 ? 'Te sobró' : 'Gastaste más de lo que entró'}</div>
        </div>
      </div>

      <div className={s.card}>
        <p className={s.cardTitle}>¿En qué se fue la plata en {periodLabel(m.month)}?</p>
        <p className={s.cardNote}>Suma lo que pagaste desde tus cuentas y lo que compraste con tus tarjetas. No cuenta los pagos a las tarjetas, los movimientos entre tus cuentas ni las inversiones, para no sumar lo mismo dos veces.</p>
        {cats.length === 0 && <p className={s.small}>Sin gastos este mes.</p>}
        {cats.map(([cat, v]) => (
          <div key={cat} className={s.barRow}>
            <span>{cat}</span>
            <div className={s.barTrack}><div className={s.barFill} style={{ width: `${(v / max) * 100}%` }} /></div>
            <span className={s.right}>{fmt(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
