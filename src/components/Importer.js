'use client';
import { useRef, useState } from 'react';
import s from '../app/app.module.css';
import { importPdf } from '../lib/import.js';
import { connectGmail, findStatementEmails, downloadAttachment, gmailConfigured } from '../lib/gmail.js';
import { getPasswords, setPasswords, isRemembered } from '../lib/store.js';
import { SUPPORTED_BANKS } from '../lib/parsers/index.js';

const ICONS = {
  waiting: ['…', '#f1f5f9', '#64748b'],
  working: ['↻', '#eff6ff', '#3b82f6'],
  needs_password: ['🔒', '#fff4e8', '#ea7a17'],
  done: ['✓', '#e6f8f1', '#08905f'],
  duplicate: ['✓', '#f1f5f9', '#64748b'],
  unsupported: ['?', '#f1f5f9', '#64748b'],
  error: ['!', '#fdecec', '#dc2626'],
  skipped: ['–', '#f1f5f9', '#94a3b8'],
};

/**
 * Agrega extractos de dos formas: conectando Gmail o subiendo PDFs.
 * Muestra el avance de cada archivo y pide la clave solo cuando hace falta.
 */
export default function Importer({ data, onImported, compact, onDone }) {
  const [queue, setQueue] = useState([]);
  const [pw, setPw] = useState(() => getPasswords()[0] || '');
  const [remember, setRemember] = useState(() => isRemembered());
  const [drag, setDrag] = useState(false);
  const [gmail, setGmail] = useState(null);
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef();
  const pending = useRef({});

  const update = (id, patch) => setQueue(q => q.map(it => (it.id === id ? { ...it, ...patch } : it)));

  function passwordsNow(extra) {
    const list = [extra, pw, ...getPasswords()].filter(Boolean);
    if (list.length) setPasswords(list, remember);
    return [...new Set(list)];
  }

  async function runItem(item, extraPw) {
    update(item.id, { status: 'working', note: 'Abriendo y leyendo…' });
    try {
      const bytes = pending.current[item.id] || (pending.current[item.id] = await item.getBytes());
      const res = await importPdf({
        bytes,
        filename: item.name,
        origin: item.origin,
        passwords: passwordsNow(extraPw),
        names: data.settings?.names || [],
      });
      if (res.status === 'done') {
        const replaced = onImported(res);
        if (res.passwordUsed) passwordsNow(res.passwordUsed);
        delete pending.current[item.id];
        update(item.id, {
          status: replaced ? 'duplicate' : 'done',
          title: res.doc.name,
          note: `${replaced ? 'Ya lo tenías; lo actualicé. ' : ''}${res.doc.txCount} movimientos · ${res.doc.check.ok ? '✓ ' : '⚠ '}${res.doc.check.label}`,
        });
      } else if (res.status === 'needs_password') {
        update(item.id, { status: 'needs_password', note: res.wrong ? 'La clave no funcionó. Escribe la clave de este extracto.' : 'Este extracto tiene clave. Normalmente es tu número de cédula.' });
      } else {
        delete pending.current[item.id];
        update(item.id, { status: res.status, note: res.message });
      }
    } catch (e) {
      update(item.id, { status: 'error', note: e.message || 'Algo falló con este archivo.' });
    }
  }

  async function runAll(items) {
    setQueue(q => [...items, ...q]);
    for (const it of items) await runItem(it);
  }

  function addFiles(fileList) {
    const files = [...fileList].filter(f => /\.pdf$/i.test(f.name));
    if (!files.length) { setMsg('Solo puedo leer archivos PDF.'); return; }
    setMsg('');
    runAll(files.map(f => ({
      id: `${f.name}-${f.size}-${Math.random()}`,
      name: f.name,
      origin: { type: 'upload', filename: f.name },
      getBytes: async () => new Uint8Array(await f.arrayBuffer()),
      status: 'waiting',
    })));
  }

  async function fromGmail() {
    setBusy(true); setMsg('');
    try {
      const conn = gmail || await connectGmail();
      setGmail(conn);
      setMsg(`Buscando extractos en ${conn.email}…`);
      const emails = await findStatementEmails(conn.token, { months });
      const items = [];
      for (const e of emails) {
        for (const a of e.attachments) {
          const already = data.processedMessages?.[`${e.messageId}:${a.filename}`];
          items.push({
            id: `${e.messageId}-${a.attachmentId.slice(0, 12)}`,
            name: a.filename,
            origin: { type: 'gmail', account: conn.email, messageId: e.messageId, subject: e.subject, from: e.from, date: e.date },
            getBytes: () => downloadAttachment(conn.token, e.messageId, a.attachmentId),
            status: already ? 'skipped' : 'waiting',
            note: already ? 'Ya lo habías importado.' : `${e.from} · ${new Date(e.date).toLocaleDateString('es-CO')}`,
          });
        }
      }
      setMsg(items.length ? `Encontré ${items.length} extracto(s) en ${conn.email}.` : `No encontré extractos en PDF en ${conn.email} de los últimos ${months} meses.`);
      const toRun = items.filter(i => i.status !== 'skipped');
      setQueue(q => [...items, ...q]);
      for (const it of toRun) await runItem(it);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!compact && (
        <div className={s.hero}>
          <h1>Tus extractos, claros y en un solo lugar</h1>
          <p>Trae tus extractos del correo o súbelos en PDF. MoneyMap los abre con tu clave, los ordena por banco y mes, y te dice qué te están cobrando de más. Todo queda en tu navegador.</p>
        </div>
      )}

      <div className={s.steps}>
        <div className={s.card}>
          <p className={s.cardTitle}><span className={s.stepNum}>1</span>Clave de tus extractos</p>
          <p className={s.cardNote}>La mayoría de bancos protegen el PDF con tu número de cédula. Escríbela una vez y la uso para abrirlos todos.</p>
          <div className={s.field}>
            <input className={s.input} type="password" inputMode="numeric" placeholder="Tu número de cédula" value={pw}
              onChange={e => setPw(e.target.value)} onBlur={() => passwordsNow()} aria-label="Clave de los extractos" />
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); setPasswords([pw, ...getPasswords()], e.target.checked); }} />
            Recordarla en este dispositivo
          </label>
          <p className={s.privacy} style={{ marginTop: 12 }}>🔐 La clave solo se usa aquí, en tu navegador, para abrir los PDF. No se envía a ningún lado.</p>
        </div>

        <div className={s.card}>
          <p className={s.cardTitle}><span className={s.stepNum}>2</span>Trae tus extractos</p>
          <p className={s.cardNote}>Leo {SUPPORTED_BANKS}.</p>

          {gmailConfigured() ? (
            <>
              <button className={`${s.btn} ${s.btnPrimary}`} style={{ width: '100%', justifyContent: 'center' }} onClick={fromGmail} disabled={busy}>
                {busy ? 'Buscando…' : gmail ? `Buscar otra vez en ${gmail.email}` : 'Buscar en mi Gmail'}
              </button>
              <div className={s.check} style={{ margin: '8px 0 12px', alignItems: 'center' }}>
                Últimos
                <select className={s.select} value={months} onChange={e => setMonths(Number(e.target.value))}>
                  {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
                </select>
                {gmail && <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setGmail(null)}>Usar otra cuenta</button>}
              </div>
              <p className={s.small} style={{ margin: '0 0 12px' }}>Solo lectura: busco correos con extractos en PDF. No leo ni guardo el resto de tus correos.</p>
            </>
          ) : (
            <p className={s.privacy} style={{ marginBottom: 12 }}>La conexión con Gmail no está activada en esta instalación. Mira el README para activarla.</p>
          )}

          <div
            className={`${s.drop} ${drag ? s.dropActive : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            role="button" tabIndex={0}
          >
            <span className={s.dropIcon}>📄</span>
            O arrastra aquí tus PDF (puedes elegir varios)
          </div>
          <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {msg && <p className={s.small} style={{ marginTop: 12 }}>{msg}</p>}

      {queue.length > 0 && (
        <div className={s.queue}>
          {queue.map(it => {
            const [icon, bg, color] = ICONS[it.status] || ICONS.waiting;
            return (
              <div key={it.id} className={s.qItem}>
                <div className={s.qIcon} style={{ background: bg, color }}>{icon}</div>
                <div className={s.qBody}>
                  <div className={s.qName}>{it.title || it.name}</div>
                  <div className={s.qMeta}>{it.title ? it.name + ' · ' : ''}{it.note}</div>
                  {it.status === 'needs_password' && (
                    <form className={s.qPw} onSubmit={e => { e.preventDefault(); runItem(it, e.target.pw.value); }}>
                      <input name="pw" className={s.input} type="password" placeholder="Clave de este PDF" autoFocus />
                      <button className={`${s.btn} ${s.btnPrimary}`}>Abrir</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
          {onDone && !busy && queue.some(q => ['done', 'duplicate'].includes(q.status)) && queue.every(q => !['waiting', 'working'].includes(q.status)) && (
            <button className={`${s.btn} ${s.btnPrimary}`} style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={onDone}>
              Listo, ver mis resultados →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
