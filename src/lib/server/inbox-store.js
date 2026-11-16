/**
 * Buzón temporal de extractos reenviados.
 * Guarda los PDF tal como llegan (casi siempre protegidos con la cédula) por 30 días como máximo.
 * El servidor NUNCA los abre ni los lee: el navegador los descarga, los abre y los borra del buzón.
 *
 * Almacenamiento: Upstash Redis (REST, sin dependencias) si hay credenciales.
 * Para probar en tu computador: INBOX_DEV_MEMORY=1 usa la memoria del proceso.
 */
const TTL = 60 * 60 * 24 * 30;
export const MAX_BYTES = 10 * 1024 * 1024;

const url = () => process.env.UPSTASH_REDIS_REST_URL;
const tok = () => process.env.UPSTASH_REDIS_REST_TOKEN;

export function inboxConfigured() {
  return !!(url() && tok()) || process.env.INBOX_DEV_MEMORY === '1';
}

export function validToken(t) {
  return typeof t === 'string' && /^[a-z0-9]{20,40}$/.test(t);
}

// --- Redis por REST ---
async function redis(cmd) {
  const res = await fetch(url(), {
    method: 'POST',
    headers: { authorization: `Bearer ${tok()}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error('storage_error');
  return (await res.json()).result;
}

// --- Memoria (solo desarrollo) ---
const mem = globalThis.__mmInbox || (globalThis.__mmInbox = new Map());

const useMem = () => !(url() && tok());

export async function putItem(token, item, contentB64) {
  const key = `inbox:${token}`;
  if (useMem()) {
    const list = mem.get(key) || [];
    list.push({ ...item, content: contentB64 });
    mem.set(key, list);
    return;
  }
  if (contentB64) await redis(['SET', `blob:${token}:${item.id}`, contentB64, 'EX', TTL]);
  await redis(['RPUSH', key, JSON.stringify(item)]);
  await redis(['EXPIRE', key, TTL]);
}

export async function listItems(token) {
  const key = `inbox:${token}`;
  if (useMem()) return (mem.get(key) || []).map(({ content, ...rest }) => rest);
  const raw = await redis(['LRANGE', key, 0, -1]);
  return (raw || []).map(r => JSON.parse(r));
}

export async function getContent(token, id) {
  if (useMem()) return (mem.get(`inbox:${token}`) || []).find(i => i.id === id)?.content || null;
  return redis(['GET', `blob:${token}:${id}`]);
}

export async function deleteItem(token, id) {
  const key = `inbox:${token}`;
  if (useMem()) {
    mem.set(key, (mem.get(key) || []).filter(i => i.id !== id));
    return;
  }
  const items = await listItems(token);
  const item = items.find(i => i.id === id);
  if (item) await redis(['LREM', key, 1, JSON.stringify(item)]);
  await redis(['DEL', `blob:${token}:${id}`]);
}
