'use client';
import { useEffect, useMemo, useState } from 'react';
import s from '../app/app.module.css';
import { fmt, fmtDate, uniqueTransactions } from '../lib/engine/insights.js';
import { KIND_LABELS } from '../lib/engine/classify.js';
import { periodLabel } from '../lib/parsers/utils.js';
import TxSource from './TxSource.js';

const CATEGORIES = ['Mercado', 'Domicilios', 'Restaurantes y salidas', 'Transporte', 'Gasolina', 'Salud', 'Deporte', 'Compras en línea', 'Hogar', 'Suscripciones', 'Servicios del hogar', 'Administración', 'Débitos automáticos', 'Entretenimiento', 'Educación', 'Regalos', 'Viajes', 'Mascotas', 'Cuidado personal', 'Impuestos', 'Otros gastos'];

// Tipos que la persona puede elegir al corregir (deciden si cuenta o no como gasto)
const EDITABLE_KINDS = ['expense', 'transfer_out', 'transfer_own', 'investment', 'card_payment', 'loan_payment', 'income', 'refund'];
const KIND_HELP = {
  expense: 'Cuenta como gasto del mes.',
  transfer_out: 'Plata que le enviaste a otra persona. No cuenta como gasto.',
  transfer_own: 'Movimiento entre tus cuentas. No cuenta como gasto.',
  investment: 'Plata que pasaste a una inversión. No cuenta como gasto.',
  card_payment: 'Pago a una tarjeta o a otro banco. El gasto ya está en la tarjeta.',
  loan_payment: 'Cuota de un crédito. Sí cuenta como gasto.',
  income: 'Plata que te entró.',
  refund: 'Devolución a tu favor.',
};

export default function Transactions({ transactions, docById, rules, onEdit, initialQuery = '' }) {
  const [q, setQ] = useState(initialQuery);
  const [month, setMonth] = useState('');
  const [kind, setKind] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [sel, setSel] = useState(null);
  const [applyAll, setApplyAll] = useState(true);

  useEffect(() => { setQ(initialQuery); }, [initialQuery]);

  const months = useMemo(() => [...new Set(transactions.map(t => t.date?.slice(0, 7)).filter(Boolean))].sort().reverse(), [transactions]);
  // Una compra a cuotas aparece en cada extracto mientras se paga: se muestra una sola vez
  const unique = useMemo(() => uniqueTransactions(transactions), [transactions]);
  const byId = useMemo(() => Object.fromEntries(transactions.map(t => [t.id, t])), [transactions]);
  const rows = useMemo(() => unique
    .filter(t => !month || t.date?.startsWith(month))
    .filter(t => !kind || t.kind === kind)
    .filter(t => !onlyReview || t.needsReview)
    .filter(t => !q || `${t.merchant} ${t.description} ${t.category} ${docById[t.docId]?.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [unique, month, kind, onlyReview, q, docById]);

  const selected = sel && unique.find(t => t.id === sel);
  const sameMerchant = selected ? unique.filter(t => t.merchantKey === selected.merchantKey) : [];
  const total = rows.filter(t => t.currency === 'COP').reduce((a, t) => a + t.amount, 0);

  function change(patch) {
    onEdit(selected.id, patch, applyAll ? selected.merchantKey : null);
  }

  function changeKind(k) {
    const category = k === 'expense'
      ? (CATEGORIES.includes(selected.category) ? selected.category : 'Otros gastos')
      : KIND_LABELS[k];
    change({ kind: k, category });
  }

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
      <p className={s.small} style={{ margin: '0 0 8px' }}>
        {rows.length} movimientos{q ? ` · total ${fmt(total)}` : ''}. Toca uno para ver de qué extracto salió o corregirlo.
      </p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>Fecha</th><th>Movimiento</th><th className={s.hideMobile}>Tipo</th><th className={s.right}>Valor</th></tr></thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id} className={s.rowClick} onClick={() => { setSel(t.id); setApplyAll(true); }}>
                <td className={s.small} style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{t.merchant || t.description}</div>
                  <div className={s.small}>
                    {t.category}{t.installments?.total > 1 ? ` · cuota ${t.installments.current} de ${t.installments.total}` : ''}
                    {' · '}{docById[t.docId]?.bank}{t.card ? ` *${t.card}` : ''}
                    {t.ruleApplied ? ' · ✓ tu regla' : ''}
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
                <p className={s.cardTitle}>{selected.merchant || selected.description}</p>
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
            {selected.alsoIn?.length > 0 && (
              <>
                <p className={s.small} style={{ margin: '12px 0 4px' }}>
                  También aparece en {selected.alsoIn.length === 1 ? 'otro extracto' : `${selected.alsoIn.length} extractos más`} porque es una compra a cuotas. Se cuenta una sola vez.
                </p>
                {selected.alsoIn.map(id => byId[id] && <TxSource key={id} tx={byId[id]} doc={docById[byId[id].docId]} />)}
              </>
            )}

            <div className={s.fixBox}>
              <p className={s.cardTitle} style={{ fontSize: 15 }}>¿Está bien clasificado?</p>
              <div className={s.field}>
                <label>Tipo</label>
                <select className={s.select} value={selected.kind} onChange={e => changeKind(e.target.value)}>
                  {[...new Set([selected.kind, ...EDITABLE_KINDS])].map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>
                <span className={s.small}>{KIND_HELP[selected.kind]}</span>
              </div>
              {selected.kind === 'expense' && (
                <div className={s.field}>
                  <label>Categoría</label>
                  <select className={s.select} value={selected.category} onChange={e => change({ category: e.target.value })}>
                    {[...new Set([selected.category, ...CATEGORIES])].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <label className={s.check}>
                <input type="checkbox" checked={applyAll} onChange={e => setApplyAll(e.target.checked)} />
                {sameMerchant.length > 1
                  ? `Aplicar a los ${sameMerchant.length} movimientos de ${selected.merchant} y a los que lleguen después`
                  : `Recordar para los próximos movimientos de ${selected.merchant}`}
              </label>
              {rules?.[selected.merchantKey] && (
                <p className={s.small} style={{ margin: '8px 0 0' }}>
                  ✓ Tienes una regla para {selected.merchant}.{' '}
                  <button className={`${s.btn} ${s.btnGhost}`} style={{ padding: '2px 6px' }} onClick={() => onEdit(selected.id, null, selected.merchantKey, true)}>Quitar regla</button>
                </p>
              )}
            </div>

            {selected.needsReview && (
              <button className={`${s.btn} ${s.btnPrimary}`} style={{ marginTop: 8 }} onClick={() => onEdit(selected.id, { needsReview: false })}>Está bien así</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
