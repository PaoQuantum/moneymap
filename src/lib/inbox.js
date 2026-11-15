'use client';
/**
 * Lado del navegador del buzón de reenvío.
 * La dirección se arma con NEXT_PUBLIC_INBOX_ADDRESS (p. ej. extractos@buzon.tudominio.co)
 * y un código secreto que se crea en este navegador:  extractos+<código>@buzon.tudominio.co
 */
export function inboxAddressBase() {
  return process.env.NEXT_PUBLIC_INBOX_ADDRESS || '';
}

export function newInboxToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...bytes].map(b => abc[b % abc.length]).join('') + [...crypto.getRandomValues(new Uint8Array(4))].map(b => abc[b % abc.length]).join('');
}

export function inboxAddress(token) {
  const base = inboxAddressBase();
  if (!base || !token) return '';
  const [local, domain] = base.split('@');
  return `${local}+${token}@${domain}`;
}

export async function listInbox(token) {
  const res = await fetch(`/api/inbox/${token}`, { cache: 'no-store' });
  if (res.status === 501) return null;
  if (!res.ok) throw new Error('No pude revisar tu buzón.');
  return (await res.json()).items || [];
}

export async function downloadInboxItem(token, id) {
  const res = await fetch(`/api/inbox/${token}/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('No pude descargar este extracto del buzón.');
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteInboxItem(token, id) {
  await fetch(`/api/inbox/${token}/${id}`, { method: 'DELETE' });
}
