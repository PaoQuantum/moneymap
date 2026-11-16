'use client';
import { useState } from 'react';
import s from '../app/app.module.css';
import { fmt, fmtDate } from '../lib/engine/insights.js';
import { buildClaim, CLAIM_STATUS } from '../lib/engine/claims.js';
import TxSource from './TxSource.js';

const TYPE_LABEL = { recover: 'Plata que puedes recuperar', save: 'Plata que puedes dejar de perder', warning: 'Atención', info: 'Para revisar' };

export default function Findings({ insights, txById, docById, claims = {}, onClaim }) {
  const [open, setOpen] = useState(null);
  const [claim, setClaim] = useState(null);

  if (!insights.length) {
    return <div className={`${s.card} ${s.empty}`}>No encontré cobros raros en tus extractos. Cuando agregues más meses, vuelvo a revisar.</div>;
  }

  return (
    <div className={s.findings}>
      {insights.map(f => {
        const evidence = f.evidence.map(id => txById[id]).filter(Boolean);
        const st = claims[f.id]?.status || 'todo';
        return (
          <div key={f.id} className={`${s.card} ${s.finding} ${s['f_' + f.type]} ${st === 'won' ? s.fDone : ''}`}>
            <div className={s.fHead}>
              <div>
                <div className={`${s.fType} ${s['t_' + f.type]}`}>{TYPE_LABEL[f.type]}</div>
                <p className={s.fTitle}>{f.title}</p>
              </div>
              {f.amount != null && f.amount > 0 && (
                <div className={s.fAmount}>{fmt(f.amount)}{(f.amountLabel || f.extra) && <div className={s.small} style={{ textAlign: 'right' }}>{[f.amountLabel, f.extra].filter(Boolean).join(' ')}</div>}</div>
              )}
            </div>
            <p className={s.fBody}>{f.body}</p>
            <div className={s.fAction}>👉 {f.action}</div>

            {f.claim && (
              <div className={s.claimBar}>
                <span className={s.small}>Estado:</span>
                {Object.entries(CLAIM_STATUS).map(([k, label]) => (
                  <button key={k} className={`${s.chip} ${st === k ? s.chipActive : ''}`} onClick={() => onClaim?.(f.id, { status: k })}>{label}</button>
                ))}
                {st !== 'todo' && (
                  <input className={s.input} style={{ maxWidth: 180, padding: '6px 10px' }} placeholder="N.º de radicado"
                    defaultValue={claims[f.id]?.radicado || ''} onBlur={e => onClaim?.(f.id, { radicado: e.target.value })} />
                )}
                {st === 'won' && (
                  <input className={s.input} style={{ maxWidth: 180, padding: '6px 10px' }} inputMode="numeric" placeholder="¿Cuánto te devolvieron?"
                    defaultValue={claims[f.id]?.recovered || ''} onBlur={e => onClaim?.(f.id, { recovered: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                )}
              </div>
            )}

            <div className={s.fButtons}>
              {f.claim && st === 'todo' && <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setClaim(f)}>Armar reclamo</button>}
              {f.claim && st !== 'todo' && <button className={s.btn} onClick={() => setClaim(f)}>Ver reclamo</button>}
              <button className={s.btn} onClick={() => setOpen(open === f.id ? null : f.id)}>
                {open === f.id ? 'Ocultar' : 'Ver de dónde sale'} ({evidence.length})
              </button>
            </div>
            {open === f.id && (
              <div style={{ marginTop: 12 }}>
                {evidence.map(t => <TxSource key={t.id} tx={t} doc={docById[t.docId]} showAmount />)}
              </div>
            )}
          </div>
        );
      })}
      {claim && (
        <ClaimModal finding={claim} txById={txById} docById={docById} onClose={() => setClaim(null)}
          onSent={() => { onClaim?.(claim.id, { status: 'sent' }); }} sent={(claims[claim.id]?.status || 'todo') !== 'todo'} />
      )}
    </div>
  );
}

function ClaimModal({ finding, txById, docById, onClose, onSent, sent }) {
  const [copied, setCopied] = useState(false);
  const c = buildClaim(finding, txById, docById);
  const hasRefunds = c.totals.refunded > 0;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <div>
            <p className={s.cardTitle}>{c.title}</p>
            <p className={s.cardNote}>Qué pides: <strong>{c.goal}</strong>. Solo incluye cobros que aparecen en tus extractos, con su página.</p>
          </div>
          <button className={`${s.btn} ${s.btnGhost} no-print`} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {c.note && <div className={s.fAction} style={{ marginBottom: 12 }}>ℹ️ {c.note}</div>}
        <div className={s.tiles}>
          <div className={s.card}><div className={s.tileLabel}>Cobrado</div><div className={s.tileValue}>{fmt(c.totals.charged)}</div></div>
          {hasRefunds && <div className={s.card}><div className={s.tileLabel}>Devuelto</div><div className={`${s.tileValue} ${s.pos}`}>{fmt(c.totals.refunded)}</div></div>}
          {hasRefunds && <div className={s.card}><div className={s.tileLabel}>Pendiente</div><div className={s.tileValue}>{fmt(c.totals.pending)}</div></div>}
        </div>
        <div className={s.tableWrap} style={{ maxHeight: 'none' }}>
          <table className={s.table}>
            <thead><tr><th>Fecha</th><th>Producto</th><th>Concepto</th><th className={s.right}>Valor</th><th className={s.hideMobile}>Extracto</th></tr></thead>
            <tbody>
              {c.rows.map(t => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                  <td>{t.card ? `*${t.card}` : 'Cuenta'}</td>
                  <td>{t.description}{t.installments?.total > 1 ? ` (${t.installments.total} cuotas)` : ''}</td>
                  <td className={`${s.right} ${t.amount > 0 ? s.pos : ''}`}>{t.amount > 0 ? '+' : ''}{fmt(t.amount, t.currency)}</td>
                  <td className={`${s.small} ${s.hideMobile}`}>{docById[t.docId]?.name} · pág. {t.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className={s.steps2}>
          {c.nextSteps.map(x => <li key={x}>{x}</li>)}
        </ol>
        <div className={`${s.fButtons} no-print`} style={{ marginTop: 8 }}>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { navigator.clipboard?.writeText(c.text); setCopied(true); }}>
            {copied ? 'Texto copiado ✓' : 'Copiar texto del reclamo'}
          </button>
          <button className={s.btn} onClick={() => window.print()}>Imprimir o guardar PDF</button>
          {!sent && <button className={s.btn} onClick={() => { onSent(); onClose(); }}>Ya lo envié</button>}
        </div>
      </div>
    </div>
  );
}
