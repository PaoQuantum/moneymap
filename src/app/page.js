"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";



export default function Home() {
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("");
  const [progress, setProgress] = useState("");
  const [batchSummary, setBatchSummary] = useState(null);
  // Default data represents the "WOW" moment mock data.
  const [data, setData] = useState({
    isMock: true,
    doc_type: "Dashboard",
    total_spent: 1000000,
    potential_savings: 18500,
    subscriptions_total: 92970,
    fixed_obligations_total: 563000,
    subscriptions: [
      { merchant: "Spotify", amount: 4990, status: "Activo" },
      { merchant: "Netflix", amount: 9990, status: "Activo" },
      { merchant: "ChatGPT Plus", amount: 20000, status: "Activo" },
      { merchant: "Adobe Creative", amount: 22990, status: "Probable" },
      { merchant: "Gym Membership", amount: 35000, status: "Probable" }
    ],
    fixed_obligations: [
      { name: "Crédito Hipotecario", amount: 450000 },
      { name: "Seguro Auto", amount: 28000 },
      { name: "Crédito Consumo", amount: 85000 }
    ],
    category_distribution: [
      { name: "Hogar", amount: 320000, pct: 32 },
      { name: "Transporte", amount: 180000, pct: 18 },
      { name: "Compras Online", amount: 245000, pct: 24 },
      { name: "Software y Apps", amount: 98000, pct: 10 },
      { name: "Comida", amount: 157000, pct: 16 }
    ],
    recent_activity: [
      { merchant: "Mercado Libre", date: "15 Abr", category: "Compras", amount: 42500 },
      { merchant: "Uber", date: "14 Abr", category: "Transporte", amount: 8500 },
      { merchant: "Netflix", date: "14 Abr", category: "Suscripción", amount: 9990 },
      { merchant: "Supermercado Jumbo", date: "13 Abr", category: "Hogar", amount: 67000 },
      { merchant: "Shell", date: "12 Abr", category: "Transporte", amount: 45000 }
    ],
    insights: [
      { insightType: "optimization", title: "Optimiza tus suscripciones", description: "Podrías ahorrar $18.500 cancelando suscripciones poco usadas", amount: 18500 },
      { insightType: "warning", title: "Gastos en transporte subieron", description: "Tus gastos en transporte aumentaron 15% este mes", amount: null },
      { insightType: "info", title: "Carga fija bajo control", description: "Tu carga fija representa 28% de tus ingresos estimados", amount: null }
    ]
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Set up PDF.js worker dynamically to avoid SSR issues
    const initPdf = async () => {
      try {
        const _pdfjsLib = await import("pdfjs-dist/build/pdf.min.mjs");
        _pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${_pdfjsLib.version}/build/pdf.worker.min.mjs`;
      } catch (err) {
        console.error("PDF.js init error:", err);
      }
    };
    initPdf();
  }, []);

  const detectPeriodFromText = (text) => {
    const sample = text.substring(0, 5000);
    const MONTHS_ES = { 'ene':'01','feb':'02','mar':'03','abr':'04','may':'05','jun':'06','jul':'07','ago':'08','sep':'09','oct':'10','nov':'11','dic':'12' };
    const parseDMY = str => { const m = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); return m ? { period:`${m[3]}-${m[2].padStart(2,'0')}`, confidence:'high' } : null; };
    const parseMonthText = str => { const m = str.match(/(\d{1,2})\s+([a-záéíóú]{3,9})\.?\s*(20\d{2})/i); if (!m) return null; const mo = MONTHS_ES[m[2].toLowerCase().substring(0,3)]; return mo ? { period:`${m[3]}-${mo}`, confidence:'high' } : null; };
    const rn = sample.match(/(\d{2}[-/]\d{2}[-/]\d{4})\s+(?:al|AL)\s+(\d{2}[-/]\d{2}[-/]\d{4})/);
    if (rn) { const r = parseDMY(rn[2]); if (r) return r; }
    const rt = sample.match(/(\d{1,2}\s+[a-záéíóú]{3,9}\.?\s*(?:20\d{2})?)\s*[-–]\s*(\d{1,2}\s+[a-záéíóú]{3,9}\.?\s*20\d{2})/i);
    if (rt) { const r = parseMonthText(rt[2]); if (r) return r; }
    const cleaned = sample.replace(/fecha\s+(?:de\s+)?(?:pago|l[ií]mite|venc\w*)[^\n]*/gi, '');
    const corte = cleaned.match(/fecha\s+(?:de\s+)?corte[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
    if (corte) { const r = parseDMY(corte[1]); if (r) return { ...r, confidence:'medium' }; }
    const dates = [...sample.matchAll(/\b(\d{2})[-/](\d{2})[-/](20\d{2})\b/g)];
    if (dates.length >= 3) { const counts = {}; dates.forEach(([,,m,y]) => { const k=`${y}-${m}`; counts[k]=(counts[k]||0)+1; }); const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; if (top) return { period: top[0], confidence: 'low' }; }
    return null;
  };

  const formatCOP = (amount) => {
    return new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const extractTextFromFile = async (file) => {
    if (file.type === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist/build/pdf.min.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let text = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map((item) => item.str).join(" ") + " ";
      }
      return text;
    }
    return file.text();
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    event.target.value = "";
    if (!files.length) return;

    setLoading(true);
    setBatchSummary(null);
    const processed = [];
    const skipped = [];
    const ambiguous = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Procesando ${i + 1} de ${files.length}: ${file.name}`);

      try {
        const extractedText = await extractTextFromFile(file);

        if (period) {
          const detected = detectPeriodFromText(extractedText);
          if (detected && detected.period !== period) {
            if (detected.confidence === 'high' || detected.confidence === 'medium') {
              skipped.push({ name: file.name, detected: detected.period });
              continue;
            } else {
              ambiguous.push({ name: file.name, detected: detected.period });
              continue;
            }
          }
        }

        const resp = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: extractedText, period: period || null }),
        });
        if (!resp.ok) {
          const errResult = await resp.json().catch(() => ({}));
          throw new Error(errResult.details || errResult.error || "API falló");
        }
        processed.push(file.name);
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        skipped.push({ name: file.name, reason: err.message });
      }
    }

    setProgress("");
    setBatchSummary({ processed: processed.length, skipped: skipped.length, ambiguous: ambiguous.length, skippedFiles: skipped, ambiguousFiles: ambiguous });

    if (processed.length > 0 && period) {
      try {
        const resp = await fetch("/api/consolidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "default-user", period }),
        });
        if (resp.ok) applyResult(await resp.json());
      } catch (err) {
        console.error("Auto-consolidate error:", err);
      }
    }

    setLoading(false);
  };

  const applyResult = (result) => {
    let total_spent = 0;
    let categories = {};
    let subsMap = {};
    let fixedTotal = 0;
    let fixedArr = [];
    let activity = [];
    let subsArr = [];
    let subsTotal = 0;

    if (result.transactions && result.transactions.length > 0) {
      result.transactions.forEach(t => {
        if (t.row_type === 'purchase' || t.row_type === 'fee' || t.row_type === 'insurance' || t.row_type === 'interest') {
           const amt = Number(t.amount_gross) || Number(t.signed_amount) || 0;
           total_spent += Math.abs(amt);
           const cat = t.category_guess || "Otros";
           categories[cat] = (categories[cat] || 0) + Math.abs(amt);
        }
        if (t.subscription_candidate || t.recurring_candidate) {
           const mName = t.merchant_normalized || t.merchant_raw;
           if (!subsMap[mName]) {
              subsMap[mName] = {
                 merchant: mName,
                 amount: Math.abs(Number(t.amount_gross) || 0),
                 status: "Activo"
              };
           }
        }
      });

      subsArr = Object.values(subsMap);
      subsTotal = subsArr.reduce((sum, s) => sum + s.amount, 0);

      activity = result.transactions.slice(0, 5).map(t => ({
        merchant: t.merchant_normalized || t.merchant_raw || "Transacción",
        date: t.date || "Reciente",
        category: t.category_guess || "General",
        amount: Math.abs(Number(t.amount_gross) || Number(t.signed_amount) || 0)
      }));
    }

    const OBLIGATION_LABELS = {
      credit_card_minimum_payment: 'Pago mínimo tarjeta',
      credit_card_full_payment:    'Pago total tarjeta',
      monthly_payment_minimum:     'Pago mínimo tarjeta',
      monthly_payment_full:        'Pago total tarjeta',
      mortgage:                    'Crédito hipotecario',
      consumer_loan:               'Crédito consumo',
      auto_insurance:              'Seguro auto',
    };

    if (result.fixed_obligations && result.fixed_obligations.length > 0) {
       result.fixed_obligations.forEach(o => {
          const amt = Number(o.payment_value_current) || 0;
          fixedTotal += amt;
          fixedArr.push({ name: OBLIGATION_LABELS[o.obligation_type] || o.issuer_name || o.obligation_type || "Obligación", amount: amt });
       });
    } else if (result.document_type === "mortgage_statement" || result.document_type === "consumer_loan_statement") {
       const amt = Number(result.payment_value_current) || Number(result.document_summary?.payment_value_current) || 0;
       fixedTotal = amt;
       fixedArr.push({ name: result.document_type === "mortgage_statement" ? "Hipotecario" : "Consumo", amount: amt });
    }

    const sortedCategories = Object.entries(categories)
      .map(([c, a]) => ({ name: c, amount: a, pct: Math.round((a / total_spent) * 100) || 0 }))
      .sort((a, b) => b.amount - a.amount);

    const savingsInsight = (result.insights || []).find(i => i.insightType === 'optimization');
    const potentialSavings = savingsInsight ? (savingsInsight.amount || 0) : (subsArr.length > 0 ? (subsArr.length * 15000) : 0);

    setData({
      isMock: false,
      doc_type: result.document_type || result.document_types?.join(', ') || "Desconocido",
      total_spent,
      potential_savings: potentialSavings,
      subscriptions_total: subsTotal,
      fixed_obligations_total: fixedTotal,
      subscriptions: subsArr,
      fixed_obligations: fixedArr.length > 0 ? fixedArr : [{name: "General", amount: fixedTotal}],
      category_distribution: sortedCategories,
      recent_activity: activity,
      insights: result.insights || []
    });
  };

  const analyzeText = async (textToAnalyze) => {
    setLoading(true);
    try {
      const resp = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToAnalyze, period: period || null }),
      });

      if (!resp.ok) {
        const errResult = await resp.json().catch(() => ({}));
        console.error("Backend error received:", errResult);
        throw new Error(errResult.details || errResult.error || "API falló");
      }

      applyResult(await resp.json());
    } catch (error) {
      console.error("Analysis error:", error);
      alert(`Error procesando los datos: ${error.message || "API límite superado o problema de red"}`);
    } finally {
      setLoading(false);
    }
  };

  const consolidateAnalysis = async () => {
    if (!period) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default-user", period }),
      });

      if (!resp.ok) {
        const errResult = await resp.json().catch(() => ({}));
        throw new Error(errResult.details || errResult.error || "Consolidate API falló");
      }

      applyResult(await resp.json());
    } catch (error) {
      console.error("Consolidate error:", error);
      alert(`Error consolidando: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoContainer}>
          <span className={styles.logo}>MoneyMap</span>
          <span className={styles.logoSubtitle}>Tu claridad financiera</span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.dateBadge}>
            📅 Marzo 2026
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf"
            multiple
            style={{ display: "none" }}
          />
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            disabled={loading}
            style={{ padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid var(--neutral-bg)", background: "var(--glass-bg)", color: "inherit" }}
          />
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            {progress || (loading ? "Procesando..." : "Subir PDFs")}
          </button>
        </div>
      </header>

      {/* Batch Summary */}
      {batchSummary && (
        <div style={{ padding: "0.75rem 1.5rem", background: "var(--glass-bg)", borderBottom: "1px solid var(--neutral-bg)", fontSize: "0.875rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <span>✅ Procesados: <strong>{batchSummary.processed}</strong></span>
          <span>⏭️ Omitidos: <strong>{batchSummary.skipped}</strong></span>
          <span>⚠️ Ambiguos: <strong>{batchSummary.ambiguous}</strong></span>
          {batchSummary.ambiguousFiles.length > 0 && (
            <span style={{ color: "var(--warn-color)" }}>
              {batchSummary.ambiguousFiles.map(f => `${f.name} (detectado: ${f.detected})`).join(", ")} — período incierto, verifica manualmente
            </span>
          )}
        </div>
      )}

      {/* Main Grid */}
      <div className={styles.bentoGrid}>
        
        {/* HERO CARD */}
        <div className={`${styles.heroCard} glass-panel flex-col gap-3`} style={{position: 'relative'}}>
          <div className="flex-between">
            <span className="badge">✨ Oportunidad detectada</span>
            <div className="flex-col" style={{alignItems: 'flex-end'}}>
              <span className={styles.cardSubtitle}>Ahorro potencial</span>
              <span style={{fontSize: '2rem', fontWeight: '800', color: 'var(--accent-base)'}}>
                {formatCOP(data.potential_savings)}
              </span>
            </div>
          </div>
          <div>
            <h1 style={{fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '0.5rem', maxWidth: '800px', lineHeight: '1.2'}}>
              Encontramos <span className={styles.textVal}>{formatCOP(data.potential_savings)}</span><br/>que podrías optimizar este mes
            </h1>
            <p className={styles.cardSubtitle} style={{fontSize: '1rem', maxWidth: '700px'}}>
              Tu mayor fuga está en apps, compras online y cargos recurrentes que podrías reducir
            </p>
          </div>
          <div className="flex-between" style={{justifyContent: 'flex-start', gap: '1rem', marginTop: '1rem'}}>
             <button className="btn btn-primary">Ver detalle →</button>
             <button className="btn">Activar monitoreo automático</button>
          </div>
        </div>

        {/* SUBSCRIPTIONS */}
        <div className={`${styles.subsCard} glass-panel flex-col gap-3`}>
           <div className="flex-between">
             <div className="flex-col">
               <h2 className={styles.cardTitle}>Suscripciones detectadas</h2>
               <span className={styles.cardSubtitle}>{data.subscriptions?.length || 0} servicios activos</span>
             </div>
             <div className="flex-col" style={{alignItems: 'flex-end'}}>
               <span className={styles.cardSubtitle}>Total mensual</span>
               <span style={{fontSize: '1.5rem', fontWeight: '700'}}>{formatCOP(data.subscriptions_total)}</span>
             </div>
           </div>
           
           <div className="flex-col">
             {(data.subscriptions || []).map((sub, idx) => (
               <div key={idx} className={styles.listItem}>
                 <div className={styles.itemIcon}>🎵</div>
                 <div className={styles.itemDetails}>
                   <div className={styles.itemTitle}>{sub.merchant}</div>
                   <div className={`badge ${sub.status === 'Probable' ? 'badge-warning' : ''}`} style={{marginTop: '0.25rem'}}>
                      {sub.status === 'Activo' ? '● Activo' : '● Probable'}
                   </div>
                 </div>
                 <div className={styles.itemAmount}>
                   <div>{formatCOP(sub.amount)}</div>
                   <div className={styles.itemSubAmount}>por mes</div>
                 </div>
               </div>
             ))}
           </div>
        </div>

        {/* FIXED OBLIGATIONS */}
        <div className={`${styles.fixedCard} glass-panel flex-col gap-3`}>
           <div className="flex-col">
             <h2 className={styles.cardTitle}>Obligaciones fijas</h2>
             <span className={styles.cardSubtitle}>Mensual</span>
           </div>
           
           <div className="flex-col gap-2">
             {(data.fixed_obligations || []).map((ob, idx) => (
               <div key={idx} className="glass-panel" style={{padding: '1rem', boxShadow: 'none', border: '1px solid var(--neutral-bg)'}}>
                 <div className="flex-col gap-1">
                   <div className={styles.cardSubtitle}>🏠 {ob.name}</div>
                   <div style={{fontSize: '1.25rem', fontWeight: '700'}}>{formatCOP(ob.amount)}</div>
                 </div>
               </div>
             ))}
           </div>
           
           <div className="flex-between" style={{marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--neutral-bg)'}}>
             <span className={styles.cardSubtitle}>Total mensual</span>
             <span style={{fontWeight: '700'}}>{formatCOP(data.fixed_obligations_total)}</span>
           </div>
        </div>

        {/* CATEGORIES */}
        <div className={`${styles.categoryCard} glass-panel flex-col gap-3`}>
           <div className="flex-col">
             <h2 className={styles.cardTitle}>Top categorías de gasto</h2>
             <span className={styles.cardSubtitle}>Distribución del mes</span>
           </div>
           
           <div className="flex-col gap-3" style={{marginTop: '1rem'}}>
             {(data.category_distribution || []).map((cat, idx) => (
               <div key={idx} className="flex-col gap-1">
                 <div className="flex-between">
                   <span style={{fontWeight: '500', fontSize: '0.9rem'}}>{cat.name}</span>
                   <div style={{display: 'flex', gap: '0.5rem', fontSize: '0.85rem'}}>
                      <span className={styles.cardSubtitle}>{cat.pct}%</span>
                      <span style={{fontWeight: '600'}}>{formatCOP(cat.amount)}</span>
                   </div>
                 </div>
                 <div className="progress-container">
                   <div className="progress-bar" style={{width: `${Math.min(cat.pct, 100)}%`}}></div>
                 </div>
               </div>
             ))}
           </div>
        </div>

        {/* RECENT ACTIVITY AND RECOMMENDATIONS ROW */}
        {/* ACTIVITY */}
        <div className={`${styles.activityCard} glass-panel flex-col gap-3`}>
           <div className="flex-col">
             <h2 className={styles.cardTitle}>Actividad reciente</h2>
             <span className={styles.cardSubtitle}>Últimos movimientos</span>
           </div>
           
           <div className="flex-col">
             {(data.recent_activity || []).map((tx, idx) => (
               <div key={idx} className={styles.listItem}>
                 <div className={styles.itemIcon}>🛍️</div>
                 <div className={styles.itemDetails}>
                   <div className={styles.itemTitle}>{tx.merchant}</div>
                   <div className={styles.cardSubtitle}>{tx.date} • {tx.category}</div>
                 </div>
                 <div className={styles.itemAmount}>
                   -{formatCOP(tx.amount)}
                 </div>
               </div>
             ))}
           </div>
        </div>

        {/* RECOMMENDATIONS */}
        <div className={`${styles.recCard} glass-panel flex-col gap-3`} style={{background: 'transparent', boxShadow: 'none', border: 'none', padding: '0'}}>
           <div className="flex-col">
             <h2 className={styles.cardTitle}>Recomendaciones</h2>
             <span className={styles.cardSubtitle}>Para mejorar tu situación</span>
           </div>

           <div className="flex-col gap-2">
             {(data.insights || []).map((ins, idx) => (
               <div key={idx} className={`${styles.recBanner} ${ins.insightType === 'optimization' || ins.insightType === 'success' ? styles.success : ins.insightType === 'warning' ? styles.warning : styles.neutral}`}>
                 <div className={styles.recIcon}>
                   {ins.insightType === 'optimization' || ins.insightType === 'success' ? '✨' : ins.insightType === 'warning' ? '⚠️' : '✔️'}
                 </div>
                 <div className="flex-col gap-1">
                    <div style={{fontWeight: '700', fontSize: '0.95rem', color: ins.insightType === 'warning' ? 'var(--warn-color)' : 'inherit'}}>
                      {ins.title}
                    </div>
                    <div className={styles.cardSubtitle}>{ins.description}</div>
                 </div>
               </div>
             ))}
           </div>
        </div>

      </div>
    </main>
  );
}
