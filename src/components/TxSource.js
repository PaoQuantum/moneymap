'use client';
import s from '../app/app.module.css';
import { fmt, fmtDate } from '../lib/engine/insights.js';

/** Muestra de qué extracto, página y línea salió un movimiento: la prueba de que no es inventado. */
export default function TxSource({ tx, doc, showAmount }) {
  const origin = doc?.origin;
  return (
    <div className={s.source}>
      {showAmount && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, marginBottom: 4 }}>
          <span>{fmtDate(tx.date)} · {tx.description}</span>
          <strong className={tx.amount > 0 ? s.pos : ''}>{fmt(tx.amount, tx.currency)}</strong>
        </div>
      )}
      <div className={s.small}>
        📄 <strong>{doc?.name || 'Extracto'}</strong> · página {tx.page}
        {origin?.type === 'gmail' && <> · llegó a {origin.account} el {new Date(origin.date).toLocaleDateString('es-CO')}{origin.subject ? ` («${origin.subject}»)` : ''}</>}
        {origin?.type === 'upload' && <> · archivo {doc.filename}</>}
      </div>
      <div className={s.sourceLine}>{tx.line}</div>
      {doc?.method === 'ai' && <div className={s.small} style={{ marginTop: 6 }}>Leído con IA y comprobado contra esta línea del PDF.</div>}
    </div>
  );
}
