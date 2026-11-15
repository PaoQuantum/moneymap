/**
 * Tus datos viven en este navegador (localStorage). No hay servidor ni base de datos:
 * nadie más puede verlos. Puedes descargar una copia o borrarlo todo cuando quieras.
 */
const KEY = 'moneymap:v2';
const PW_KEY = 'moneymap:passwords';

const empty = () => ({ docs: {}, transactions: {}, processedMessages: {}, settings: { names: [] } });

export function loadData() {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
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

// Agrega un documento procesado. Si el mismo extracto ya estaba, lo reemplaza (no se duplica).
export function addDocument(data, { doc, transactions }) {
  const next = { ...data, docs: { ...data.docs }, transactions: { ...data.transactions } };
  const replaced = !!next.docs[doc.id];
  for (const [id, t] of Object.entries(next.transactions)) if (t.docId === doc.id) delete next.transactions[id];
  next.docs[doc.id] = doc;
  for (const t of transactions) next.transactions[t.id] = { ...t, docAccount: doc.accountLast4 };
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
