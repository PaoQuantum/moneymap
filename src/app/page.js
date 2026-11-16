'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import s from './app.module.css';
import Importer from '../components/Importer.js';
import Summary from '../components/Summary.js';
import HomeView from '../components/Home.js';
import Transactions from '../components/Transactions.js';
import Documents from '../components/Documents.js';
import { loadData, saveData, addDocument, removeDocument, updateTransaction, setMerchantRule, removeMerchantRule, setClaim, clearAll, restoreData } from '../lib/store.js';
import { buildInsights, monthlySummary } from '../lib/engine/insights.js';
import { periodLabel } from '../lib/parsers/utils.js';
import { encryptBackup, decryptBackup } from '../lib/backup.js';
import { listInbox } from '../lib/inbox.js';

export default function Page() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('home');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const restoreRef = useRef(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [autoInbox, setAutoInbox] = useState(false);

  useEffect(() => { const d = loadData(); setData(d); if (!Object.keys(d.docs).length) setAdding(true); }, []);
  useEffect(() => { if (data) saveData(data); }, [data]);
  // Al abrir la app, mira si llegaron extractos nuevos al buzón
  const inboxToken = data?.settings?.inboxToken;
  useEffect(() => {
    if (!inboxToken) return;
    listInbox(inboxToken).then(items => setInboxCount((items || []).filter(i => i.kind === 'pdf').length)).catch(() => {});
  }, [inboxToken]);

  const docs = useMemo(() => (data ? Object.values(data.docs) : []), [data]);
  const transactions = useMemo(() => (data ? Object.values(data.transactions) : []), [data]);
  const docById = useMemo(() => Object.fromEntries(docs.map(d => [d.id, d])), [docs]);
  const txById = useMemo(() => Object.fromEntries(transactions.map(t => [t.id, t])), [transactions]);
  const insights = useMemo(() => buildInsights(transactions, docs), [transactions, docs]);
  const months = useMemo(() => monthlySummary(transactions), [transactions]);
  const periodText = useMemo(() => {
    const ps = docs.map(d => d.period).filter(Boolean).sort();
    if (!ps.length) return '';
    return ps[0] === ps[ps.length - 1] ? periodLabel(ps[0]) : `de ${periodLabel(ps[0])} a ${periodLabel(ps[ps.length - 1])}`;
  }, [docs]);

  if (!data) return null;

  function onImported(res) {
    let replaced = false;
    setData(prev => {
      const r = addDocument(prev, res);
      replaced = r.replaced;
      const o = res.doc.origin;
      if (o?.messageId) r.data.processedMessages = { ...r.data.processedMessages, [`${o.messageId}:${res.doc.filename}`]: res.doc.id };
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

  async function exportData() {
    const pass = prompt('Elige una contraseña para proteger tu copia. La vas a necesitar para restaurarla (no se puede recuperar si la olvidas).');
    if (!pass) return;
    const blob = new Blob([await encryptBackup(data, pass)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moneymap-copia-${new Date().toISOString().slice(0, 10)}.mmap`;
    a.click();
  }

  async function importBackup(file) {
    const pass = prompt('Contraseña de la copia');
    if (!pass) return;
    try {
      const restored = await decryptBackup(await file.text(), pass);
      if (Object.keys(data.docs).length && !confirm('Esto reemplaza lo que tienes ahora en este navegador por la copia. ¿Seguir?')) return;
      setData(restoreData(restored));
      setAdding(false); setTab('home');
    } catch (e) {
      alert(e.message || 'No pude abrir la copia.');
    }
  }

  const hasData = docs.length > 0;
  const pendingClaims = insights.filter(f => f.claim && (data.claims[f.id]?.status || 'todo') === 'todo').length;

  return (
    <main className={s.shell}>
      <header className={s.header}>
        <div className={s.brand}>
          <div className={s.logo}>M</div>
          <div>
            <div className={s.brandName}>MoneyMap</div>
            <div className={s.brandTag}>Recupera lo que el banco te cobró de más</div>
          </div>
        </div>
        {hasData && !adding && <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setAdding(true)}>+ Agregar extractos</button>}
        {hasData && adding && <button className={s.btn} onClick={() => setAdding(false)}>Ver mis resultados</button>}
      </header>

      {adding && <Importer data={data} onImported={onImported} compact={hasData} autoInbox={autoInbox}
        onSettings={patch => setData(d => ({ ...d, settings: { ...d.settings, ...patch } }))}
        onDone={() => { setAdding(false); setAutoInbox(false); setInboxCount(0); setTab('home'); window.scrollTo(0, 0); }} />}

      {!adding && inboxCount > 0 && (
        <button className={s.inboxBanner} onClick={() => { setAutoInbox(true); setAdding(true); }}>
          📮 Llegaron {inboxCount} extracto{inboxCount > 1 ? 's' : ''} nuevo{inboxCount > 1 ? 's' : ''} a tu buzón · Importar →
        </button>
      )}

      {!adding && hasData && (
        <>
          <nav className={s.tabs}>
            {[
              ['home', 'Inicio', pendingClaims],
              ['spending', 'Tus gastos'],
              ['movements', 'Movimientos'],
              ['docs', 'Extractos', docs.length],
            ].map(([id, label, count]) => (
              <button key={id} className={`${s.tab} ${tab === id ? s.tabActive : ''}`} onClick={() => { setTab(id); if (id === 'movements') setQuery(''); }}>
                {label}{count ? <span className={s.badge}>{count}</span> : null}
              </button>
            ))}
          </nav>

          {tab === 'home' && <HomeView insights={insights} txById={txById} docById={docById} claims={data.claims} docsCount={docs.length} periodText={periodText} onClaim={(id, patch) => setData(d => setClaim(d, id, patch))} />}
          {tab === 'spending' && <Summary months={months} onMerchant={name => { setQuery(name); setTab('movements'); }} />}
          {tab === 'movements' && <Transactions transactions={transactions} docById={docById} rules={data.settings.rules} onEdit={onEdit} initialQuery={query} />}
          {tab === 'docs' && <Documents docs={docs} onRemove={id => setData(d => removeDocument(d, id))} onAdd={() => setAdding(true)} />}
        </>
      )}

      <footer className={`${s.footer} no-print`}>
        <span>🔐 Tus extractos y movimientos están guardados solo en este navegador.</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasData && <button className={`${s.btn} ${s.btnGhost}`} onClick={exportData}>Descargar copia cifrada</button>}
          <button className={`${s.btn} ${s.btnGhost}`} onClick={() => restoreRef.current?.click()}>Restaurar copia</button>
          <input ref={restoreRef} type="file" accept=".mmap" hidden onChange={e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; }} />
          {hasData && <button className={`${s.btn} ${s.btnGhost} ${s.btnDanger}`} onClick={() => { if (confirm('¿Borrar todos tus extractos y movimientos de este navegador? No se puede deshacer.')) { clearAll(); setData(loadData()); setAdding(true); } }}>Borrar todo</button>}
        </span>
      </footer>
    </main>
  );
}
