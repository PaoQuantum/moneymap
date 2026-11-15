import { normalizeMerchant, applyRule } from './engine/merchant.js';
import { classify } from './engine/classify.js';

/**
 * Tus datos viven en este navegador (localStorage). No hay servidor ni base de datos:
 * nadie más puede verlos. Puedes descargar una copia o borrarlo todo cuando quieras.
 */
const KEY = 'moneymap:v2';
const PW_KEY = 'moneymap:passwords';

const empty = () => ({ docs: {}, transactions: {}, processedMessages: {}, claims: {}, settings: { names: [], rules: {} } });

export function loadData() {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? migrate({ ...empty(), ...JSON.parse(raw) }) : empty();
  } catch {
    return empty();
  }
}

export function saveData(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Datos guardados con una versión anterior: se les agrega el comercio normalizado
function migrate(data) {
  data.settings = { names: [], rules: {}, ...data.settings };
  data.settings.rules = data.settings.rules || {};
  data.claims = data.claims || {};
  for (const t of Object.values(data.transactions)) {
    if (!t.merchantKey) { const m = normalizeMerchant(t.description); t.merchant = m.name; t.merchantKey = m.key; }
  }
  return data;
}

// Restaurar una copia de seguridad
export function restoreData(raw) {
  if (!raw || typeof raw !== 'object' || !raw.docs || !raw.transactions) throw new Error('La copia está incompleta.');
  return migrate({ ...empty(), ...raw });
}

// Agrega un documento procesado. Si el mismo extracto ya estaba, lo reemplaza (no se duplica).
export function addDocument(data, { doc, transactions }) {
  const next = { ...data, docs: { ...data.docs }, transactions: { ...data.transactions } };
  const replaced = !!next.docs[doc.id];
  for (const [id, t] of Object.entries(next.transactions)) if (t.docId === doc.id) delete next.transactions[id];
  next.docs[doc.id] = doc;
  const rules = data.settings?.rules || {};
  for (const t of transactions) next.transactions[t.id] = applyRule({ ...t, docAccount: doc.accountLast4 }, rules);
  return { data: next, replaced };
}

export function removeDocument(data, docId) {
  const next = { ...data, docs: { ...data.docs }, transactions: { ...data.transactions } };
  delete next.docs[docId];
  for (const [id, t] of Object.entries(next.transactions)) if (t.docId === docId) delete next.transactions[id];
  return next;
}

export function updateTransaction(data, id, patch) {
  const t = data.transactions[id];
  if (!t) return data;
  return { ...data, transactions: { ...data.transactions, [id]: { ...t, ...patch, editedByUser: true } } };
}

/**
 * La persona corrigió un movimiento y pidió aplicarlo a todo el comercio:
 * se guarda la regla y se aplica a lo que ya está (y a lo que llegue después, en addDocument).
 */
export function setMerchantRule(data, merchantKey, rule) {
  const rules = { ...data.settings.rules, [merchantKey]: { ...data.settings.rules?.[merchantKey], ...rule } };
  const transactions = { ...data.transactions };
  for (const [id, t] of Object.entries(transactions)) {
    if (t.merchantKey === merchantKey) transactions[id] = applyRule({ ...t, editedByUser: false }, rules);
  }
  return { ...data, transactions, settings: { ...data.settings, rules } };
}

export function removeMerchantRule(data, merchantKey) {
  const rules = { ...data.settings.rules };
  delete rules[merchantKey];
  // Los movimientos vuelven a la clasificación automática
  const transactions = { ...data.transactions };
  for (const [id, t] of Object.entries(transactions)) {
    if (t.merchantKey === merchantKey && t.ruleApplied) {
      const { kind, category } = classify(t);
      transactions[id] = { ...t, kind, category, ruleApplied: false };
    }
  }
  return { ...data, transactions, settings: { ...data.settings, rules } };
}

// Seguimiento de reclamos: { status: todo|sent|won|lost, radicado, recovered, updatedAt }
export function setClaim(data, findingId, patch) {
  const prev = data.claims?.[findingId] || { status: 'todo' };
  return { ...data, claims: { ...data.claims, [findingId]: { ...prev, ...patch, updatedAt: new Date().toISOString() } } };
}

// Claves de los PDF: por defecto solo duran mientras la pestaña está abierta
export function getPasswords() {
  if (typeof window === 'undefined') return [];
  try {
    const s = window.sessionStorage.getItem(PW_KEY) || window.localStorage.getItem(PW_KEY);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

export function setPasswords(list, remember) {
  const value = JSON.stringify([...new Set(list.filter(Boolean))]);
  window.sessionStorage.setItem(PW_KEY, value);
  if (remember) window.localStorage.setItem(PW_KEY, value);
  else window.localStorage.removeItem(PW_KEY);
}

export function isRemembered() {
  return typeof window !== 'undefined' && !!window.localStorage.getItem(PW_KEY);
}

export function clearAll() {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(PW_KEY);
  window.sessionStorage.removeItem(PW_KEY);
}
