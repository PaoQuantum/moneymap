'use client';
import { useEffect, useMemo, useState } from 'react';
import s from './app.module.css';
import Importer from '../components/Importer.js';
import Summary from '../components/Summary.js';
import Findings from '../components/Findings.js';
import Transactions from '../components/Transactions.js';
import Documents from '../components/Documents.js';
import { loadData, saveData, addDocument, removeDocument, updateTransaction, setMerchantRule, removeMerchantRule, clearAll } from '../lib/store.js';
import { buildInsights, monthlySummary } from '../lib/engine/insights.js';

export default function Home() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('summary');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => { const d = loadData(); setData(d); if (!Object.keys(d.docs).length) setAdding(true); }, []);
  useEffect(() => { if (data) saveData(data); }, [data]);

  const docs = useMemo(() => (data ? Object.values(data.docs) : []), [data]);
  const transactions = useMemo(() => (data ? Object.values(data.transactions) : []), [data]);
  const docById = useMemo(() => Object.fromEntries(docs.map(d => [d.id, d])), [docs]);
  const txById = useMemo(() => Object.fromEntries(transactions.map(t => [t.id, t])), [transactions]);
  const insights = useMemo(() => buildInsights(transactions, docs), [transactions, docs]);
  const months = useMemo(() => monthlySummary(transactions), [transactions]);
  const moneyFindings = insights.filter(i => i.type === 'recover' || i.type === 'save').reduce((a, i) => a + (i.amount || 0), 0);

  if (!data) return null;

  function onImported(res) {
    let replaced = false;
    setData(prev => {
      const r = addDocument(prev, res);
      replaced = r.replaced;
      const o = res.doc.origin;
      if (o?.type === 'gmail') r.data.processedMessages = { ...r.data.processedMessages, [`${o.messageId}:${res.doc.filename}`]: res.doc.id };
      return r.data;
    });
    return replaced;
  }

  // Corrección de un movimiento. Si viene merchantKey, se guarda como regla para todo ese comercio.
  function onEdit(id, patch, merchantKey, removeRule) {
    setData(d => {
      if (removeRule) return removeMerchantRule(d, merchantKey);
      if (merchantKey && (patch.kind || patch.category)) {
        const rule = {};
        if (patch.kind) rule.kind = patch.kind;
        if (patch.category) rule.category = patch.category;
        return setMerchantRule(d, merchantKey, rule);
      }
      return updateTransaction(d, id, patch);
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moneymap-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  const hasData = docs.length > 0;

  return (
    <main className={s.shell}>
      <header className={s.header}>
        <div className={s.brand}>
          <div className={s.logo}>M</div>
          <div>
            <div className={s.brandName}>MoneyMap</div>
            <div className={s.brandTag}>Entiende tu plata, mes a mes</div>
          </div>
        </div>
        {hasData && !adding && <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setAdding(true)}>+ Agregar extractos</button>}
        {hasData && adding && <button className={s.btn} onClick={() => setAdding(false)}>Ver mis resultados</button>}
      </header>

      {adding && <Importer data={data} onImported={onImported} compact={hasData} onDone={() => { setAdding(false); setTab('summary'); }} />}

      {!adding && hasData && (
        <>
          <nav className={s.tabs}>
            {[
              ['summary', 'Resumen'],
              ['findings', 'Cobros a revisar', insights.filter(i => i.type !== 'info').length],
              ['movements', 'Movimientos'],
              ['docs', 'Extractos', docs.length],
            ].map(([id, label, count]) => (
              <button key={id} className={`${s.tab} ${tab === id ? s.tabActive : ''}`} onClick={() => { setTab(id); if (id === 'movements') setQuery(''); }}>
                {label}{count ? <span className={s.badge}>{count}</span> : null}
              </button>
            ))}
          </nav>

          {tab === 'summary' && <Summary months={months} findingsTotal={moneyFindings} onGoFindings={() => setTab('findings')} onMerchant={name => { setQuery(name); setTab('movements'); }} />}
          {tab === 'findings' && <Findings insights={insights} txById={txById} docById={docById} />}
          {tab === 'movements' && <Transactions transactions={transactions} docById={docById} rules={data.settings.rules} onEdit={onEdit} initialQuery={query} />}
          {tab === 'docs' && <Documents docs={docs} onRemove={id => setData(d => removeDocument(d, id))} onAdd={() => setAdding(true)} />}
        </>
      )}

      <footer className={`${s.footer} no-print`}>
        <span>🔐 Tus extractos y movimientos están guardados solo en este navegador.</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {hasData && <button className={`${s.btn} ${s.btnGhost}`} onClick={exportData}>Descargar copia</button>}
          {hasData && <button className={`${s.btn} ${s.btnGhost} ${s.btnDanger}`} onClick={() => { if (confirm('¿Borrar todos tus extractos y movimientos de este navegador? No se puede deshacer.')) { clearAll(); setData(loadData()); setAdding(true); } }}>Borrar todo</button>}
        </span>
      </footer>
    </main>
  );
}
