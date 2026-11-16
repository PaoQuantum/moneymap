/**
 * Conexión con Gmail, directo desde el navegador y en modo solo lectura.
 * - Pide permiso con el inicio de sesión de Google (gmail.readonly).
 * - Busca correos con extractos en PDF y descarga los adjuntos.
 * - El permiso dura una sesión y no se guarda: tus correos no pasan por ningún servidor.
 *
 * Requiere NEXT_PUBLIC_GOOGLE_CLIENT_ID (ver README).
 */
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const GMAIL_QUERY = 'has:attachment filename:pdf (extracto OR extractos OR "estado de cuenta" OR statement)';

export function gmailConfigured() {
  return !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

let gisPromise = null;
function loadGoogleScript() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google.'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

export async function connectGmail() {
  await loadGoogleScript();
  const token = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      scope: SCOPE,
      prompt: 'select_account',
      callback: res => (res.error ? reject(new Error(res.error)) : resolve(res.access_token)),
      error_callback: err => reject(new Error(err?.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : 'No se pudo conectar con Google.')),
    });
    client.requestAccessToken();
  });
  const profile = await gget(token, '/profile');
  return { token, email: profile.emailAddress };
}

async function gget(token, path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error('El permiso de Gmail venció. Conéctate de nuevo.');
  if (!res.ok) throw new Error('Gmail no respondió. Intenta otra vez.');
  return res.json();
}

function header(msg, name) {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function findPdfParts(part, acc = []) {
  if (!part) return acc;
  if (part.filename && /\.pdf$/i.test(part.filename) && part.body?.attachmentId) acc.push(part);
  for (const p of part.parts || []) findPdfParts(p, acc);
  return acc;
}

function base64UrlToBytes(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Lista los correos con extractos de los últimos `months` meses. */
export async function findStatementEmails(token, { months = 3, max = 60 } = {}) {
  const q = encodeURIComponent(`${GMAIL_QUERY} newer_than:${months}m`);
  const list = await gget(token, `/messages?q=${q}&maxResults=${max}`);
  const out = [];
  for (const { id } of list.messages || []) {
    const msg = await gget(token, `/messages/${id}?format=full`);
    const pdfs = findPdfParts(msg.payload);
    if (!pdfs.length) continue;
    out.push({
      messageId: id,
      subject: header(msg, 'Subject'),
      from: header(msg, 'From').replace(/<.*>/, '').replace(/"/g, '').trim(),
      date: new Date(Number(msg.internalDate)).toISOString(),
      attachments: pdfs.map(p => ({ filename: p.filename, attachmentId: p.body.attachmentId, size: p.body.size })),
    });
  }
  return out;
}

export async function downloadAttachment(token, messageId, attachmentId) {
  const res = await gget(token, `/messages/${messageId}/attachments/${attachmentId}`);
  return base64UrlToBytes(res.data);
}
