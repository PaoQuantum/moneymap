'use client';
import s from '../app/app.module.css';
import { periodLabel } from '../lib/parsers/utils.js';
import { fmtDate } from '../lib/engine/insights.js';

export default function Documents({ docs, onRemove, onAdd }) {
  const groups = {};
  for (const d of docs) (groups[d.period || 'sin-periodo'] = groups[d.period || 'sin-periodo'] || []).push(d);
  const keys = Object.keys(groups).sort().reverse();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <p className={s.small} style={{ margin: 0 }}>Cada extracto queda con su banco, producto y mes. Al lado ves si los números cuadraron con los totales del banco.</p>
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={onAdd}>Agregar extractos</button>
      </div>
      {keys.map(k => (
        <div key={k} className={s.docGroup}>
          <p className={s.docGroupTitle}>{k === 'sin-periodo' ? 'Sin periodo identificado' : periodLabel(k)}</p>
          {groups[k].map(d => (
            <div key={d.id} className={s.docItem}>
              <div style={{ fontSize: 22 }}>{d.check?.ok ? '✅' : '⚠️'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{d.name}</div>
                <div className={s.small}>
                  {d.txCount} movimientos · {d.pages} página{d.pages > 1 ? 's' : ''}
                  {d.periodStart && d.periodEnd ? ` · del ${fmtDate(d.periodStart)} al ${fmtDate(d.periodEnd)}` : d.periodEnd ? ` · corte ${fmtDate(d.periodEnd)}` : ''}
                  {d.dueDate ? ` · pagar antes del ${fmtDate(d.dueDate)}` : ''}
                </div>
                <div className={`${s.small} ${d.check?.ok ? s.ok : s.warnText}`} style={{ marginTop: 4 }}>{d.check?.label}</div>
                <div className={s.small} style={{ marginTop: 4 }}>
                  {d.origin?.type === 'gmail' && <>Llegó a {d.origin.account} · {d.origin.from} · {new Date(d.origin.date).toLocaleDateString('es-CO')}</>}
                  {d.origin?.type === 'inbox' && <>Llegó a tu buzón · {d.origin.from} · {new Date(d.origin.date).toLocaleDateString('es-CO')}</>}
                  {(!d.origin || d.origin.type === 'upload') && <>Subido a mano · {d.filename}</>}
                  {d.method === 'ai' ? ' · leído con IA' : ''}
                </div>
              </div>
              <button className={`${s.btn} ${s.btnGhost} ${s.btnDanger}`} onClick={() => { if (confirm(`¿Quitar «${d.name}» y sus movimientos?`)) onRemove(d.id); }}>Quitar</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
