'use client';
import { useMemo, useState } from 'react';
import s from '../app/app.module.css';
import { fmt, fmtDate } from '../lib/engine/insights.js';
import { KIND_LABELS } from '../lib/engine/classify.js';
import { periodLabel } from '../lib/parsers/utils.js';
import TxSource from './TxSource.js';

const CATEGORIES = ['Mercado', 'Domicilios', 'Restaurantes y salidas', 'Transporte', 'Gasolina', 'Salud', 'Deporte', 'Compras en línea', 'Hogar', 'Suscripciones', 'Servicios del hogar', 'Administración', 'Débitos automáticos', 'Entretenimiento', 'Educación', 'Regalos', 'Viajes', 'Impuestos', 'Otros gastos'];

export default function Transactions({ transactions, docById, onEdit }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [kind, setKind] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [sel, setSel] = useState(null);

  const months = useMemo(() => [...new Set(transactions.map(t => t.date?.slice(0, 7)).filter(Boolean))].sort().reverse(), [transactions]);
  const rows = useMemo(() => transactions
    .filter(t => !month || t.date?.startsWith(month))
    .filter(t => !kind || t.kind === kind)
    .filter(t => !onlyReview || t.needsReview)
    .filter(t => !q || `${t.description} ${t.category} ${docById[t.docId]?.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [transactions, month, kind, onlyReview, q, docById]);

  const selected = sel && transactions.find(t => t.id === sel);

  return (
    <div>
      <div className={s.toolbar}>
        <input className={s.input} placeholder="Buscar: mercar, uber, cuota de manejo…" value={q} onChange={e => setQ(e.target.value)} />
        <select className={s.select} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">Todos los meses</option>
          {months.map(m => <option key={m} value={m}>{periodLabel(m)}</option>)}
        </select>
        <select className={s.select} value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className={s.check} style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} /> Solo para revisar
        </label>
      </div>
      <p className={s.small} style={{ margin: '0 0 8px' }}>{rows.length} movimientos. Toca uno para ver de qué extracto salió.</p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Fecha</th><th>Movimiento</th><th className={s.hideMobile}>Tipo</th><th className={s.right}>Valor</th></tr></thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id} className={s.rowClick} onClick={() => setSel(t.id)}>
                <td className={s.small} style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                <td>
                  <div>{t.description}</div>
                  <div className={s.small}>
                    {t.category}{t.installments?.total > 1 ? ` · cuota ${t.installments.current} de ${t.installments.total}` : ''}
                    {' · '}{docById[t.docId]?.bank}{t.card ? ` *${t.card}` : ''}
                  </div>
                  {t.needsReview && <span className={`${s.pill} ${s.pillWarn}`}>Para revisar</span>}
                </td>
                <td className={s.hideMobile}><span className={s.pill}>{KIND_LABELS[t.kind]}</span></td>
                <td className={`${s.right} ${t.amount > 0 ? s.pos : ''}`}>{fmt(t.amount, t.currency)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className={s.empty}>No hay movimientos con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className={s.overlay} onClick={() => setSel(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHead}>
              <div>
                <p className={s.cardTitle}>{selected.description}</p>
                <p className={s.cardNote}>{fmtDate(selected.date)} · {KIND_LABELS[selected.kind]}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={s.fAmount}>{fmt(selected.amount, selected.currency)}</div>
                <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setSel(null)}>Cerrar</button>
              </div>
            </div>
            {selected.needsReview && <div className={s.fAction}>⚠ {selected.reviewReason || 'Revisa este movimiento.'}</div>}
            <p className={s.small} style={{ margin: '0 0 4px' }}>De dónde salió</p>
            <TxSource tx={selected} doc={docById[selected.docId]} />
            {(selected.kind === 'expense') && (
              <div className={s.field} style={{ marginTop: 16 }}>
                <label>Categoría</label>
                <select className={s.select} value={selected.category} onChange={e => onEdit(selected.id, { category: e.target.value })}>
                  {[...new Set([selected.category, ...CATEGORIES])].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
            {selected.needsReview && (
              <button className={`${s.btn} ${s.btnPrimary}`} style={{ marginTop: 8 }} onClick={() => onEdit(selected.id, { needsReview: false })}>Está bien así</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
