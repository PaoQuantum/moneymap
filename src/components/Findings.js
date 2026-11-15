'use client';
import { useState } from 'react';
import s from '../app/app.module.css';
import { fmt, fmtDate } from '../lib/engine/insights.js';
import TxSource from './TxSource.js';

const TYPE_LABEL = { recover: 'Plata que puedes recuperar', save: 'Plata que puedes ahorrar', warning: 'Atención', info: 'Para revisar' };

export default function Findings({ insights, txById, docById }) {
  const [open, setOpen] = useState(null);
  const [claim, setClaim] = useState(null);

  if (!insights.length) {
    return <div className={`${s.card} ${s.empty}`}>No encontré cobros raros en tus extractos. Cuando agregues más meses, vuelvo a revisar.</div>;
  }

  return (
    <div className={s.findings}>
      {insights.map(f => {
        const evidence = f.evidence.map(id => txById[id]).filter(Boolean);
        return (
          <div key={f.id} className={`${s.card} ${s.finding} ${s['f_' + f.type]}`}>
            <div className={s.fHead}>
              <div>
                <div className={`${s.fType} ${s['t_' + f.type]}`}>{TYPE_LABEL[f.type]}</div>
                <p className={s.fTitle}>{f.title}</p>
              </div>
              {f.amount != null && f.amount > 0 && (
                <div className={s.fAmount}>{fmt(f.amount)}{f.extra && <div className={s.small} style={{ textAlign: 'right' }}>{f.extra}</div>}</div>
              )}
            </div>
            <p className={s.fBody}>{f.body}</p>
            <div className={s.fAction}>👉 {f.action}</div>
            <div className={s.fButtons}>
              <button className={s.btn} onClick={() => setOpen(open === f.id ? null : f.id)}>
                {open === f.id ? 'Ocultar' : 'Ver de dónde sale'} ({evidence.length})
              </button>
              {f.claim && <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setClaim(f)}>Armar reclamo</button>}
            </div>
            {open === f.id && (
              <div style={{ marginTop: 12 }}>
                {evidence.map(t => <TxSource key={t.id} tx={t} doc={docById[t.docId]} showAmount />)}
              </div>
            )}
          </div>
        );
      })}
      {claim && <ClaimModal finding={claim} txById={txById} docById={docById} onClose={() => setClaim(null)} />}
    </div>
  );
}

function ClaimModal({ finding, txById, docById, onClose }) {
  const [copied, setCopied] = useState(false);
  const charged = finding.claim.charged.map(id => txById[id]).filter(Boolean);
  const refunded = finding.claim.refunded.map(id => txById[id]).filter(Boolean);
  const totalCharged = charged.reduce((a, t) => a - t.amount, 0);
  const totalRefunded = refunded.reduce((a, t) => a + t.amount, 0);
  const rows = [...charged, ...refunded].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const text = [
    `Buenos días. Solicito la devolución de las cuotas de manejo cobradas en mis tarjetas ${finding.claim.bank}, porque al ofrecerme el producto me informaron que no tendría cuota de manejo (o cumplo la condición de exoneración).`,
    '',
    'Detalle de los cobros:',
    ...rows.map(t => `- ${fmtDate(t.date)} · Tarjeta *${t.card || '—'} · ${t.description} · ${t.amount > 0 ? '+' : ''}${fmt(t.amount)}`),
    '',
    `Total cobrado: ${fmt(totalCharged)}. Total devuelto: ${fmt(totalRefunded)}. Pendiente por devolver: ${fmt(totalCharged - totalRefunded)}.`,
    'Quedo pendiente del número de radicado. Gracias.',
  ].join('\n');

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <div>
            <p className={s.cardTitle}>Reclamo de cuotas de manejo · {finding.claim.bank}</p>
            <p className={s.cardNote}>Solo incluye cobros que aparecen en tus extractos. Toma una captura de la tabla o copia el texto.</p>
          </div>
          <button className={`${s.btn} ${s.btnGhost} no-print`} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className={s.tiles}>
          <div className={s.card}><div className={s.tileLabel}>Cobrado</div><div className={s.tileValue}>{fmt(totalCharged)}</div></div>
          <div className={s.card}><div className={s.tileLabel}>Devuelto</div><div className={`${s.tileValue} ${s.pos}`}>{fmt(totalRefunded)}</div></div>
          <div className={s.card}><div className={s.tileLabel}>Por devolver</div><div className={s.tileValue}>{fmt(totalCharged - totalRefunded)}</div></div>
        </div>
        <div className={s.tableWrap} style={{ maxHeight: 'none' }}>
          <table className={s.table}>
            <thead><tr><th>Fecha</th><th>Tarjeta</th><th>Concepto</th><th className={s.right}>Valor</th><th>Extracto</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td>*{t.card || '—'}</td>
                  <td>{t.description}</td>
                  <td className={`${s.right} ${t.amount > 0 ? s.pos : ''}`}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}</td>
                  <td className={s.small}>{docById[t.docId]?.name} · pág. {t.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`${s.fButtons} no-print`} style={{ marginTop: 16 }}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { navigator.clipboard.writeText(text); setCopied(true); }}>
            {copied ? 'Texto copiado ✓' : 'Copiar texto del reclamo'}
          </button>
          <button className={s.btn} onClick={() => window.print()}>Imprimir o guardar PDF</button>
        </div>
      </div>
    </div>
  );
}
