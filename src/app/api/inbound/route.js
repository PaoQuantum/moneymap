import { NextResponse } from 'next/server';
import { inboxConfigured, putItem, validToken, MAX_BYTES } from '../../../lib/server/inbox-store.js';

/**
 * Recibe los correos reenviados (webhook de entrada de Postmark).
 * La dirección de cada persona es  buzon+<token>@tu-dominio  y Postmark entrega el <token> en MailboxHash.
 * Solo se guardan adjuntos PDF. Si el correo no trae PDF (por ejemplo, el código de confirmación
 * que manda Gmail al activar el reenvío), se guarda el asunto y un fragmento del texto
 * para que la persona lo vea en la app.
 */
export async function POST(req) {
  if (!inboxConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  const secret = process.env.INBOUND_SECRET;
  if (!secret || new URL(req.url).searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const mail = await req.json();
  const token = String(mail.MailboxHash || '').toLowerCase();
  // Respondemos 200 aunque el token no sirva, para que el proveedor no reintente sin fin
  if (!validToken(token)) return NextResponse.json({ ok: true, stored: 0 });

  const base = {
    messageId: String(mail.MessageID || ''),
    from: String(mail.FromFull?.Email || mail.From || '').slice(0, 200),
    subject: String(mail.Subject || '').slice(0, 300),
    date: mail.Date ? new Date(mail.Date).toISOString() : new Date().toISOString(),
  };

  let stored = 0;
  for (const [i, a] of (mail.Attachments || []).entries()) {
    const isPdf = /pdf/i.test(a.ContentType || '') || /\.pdf$/i.test(a.Name || '');
    const size = Number(a.ContentLength) || Math.floor((a.Content || '').length * 0.75);
    if (!isPdf || !a.Content || size > MAX_BYTES) continue;
    const id = `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 8)}`;
    await putItem(token, { ...base, id, kind: 'pdf', filename: String(a.Name || 'extracto.pdf').slice(0, 150), size }, a.Content);
    stored++;
  }

  if (!stored) {
    const text = String(mail.TextBody || mail.StrippedTextReply || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    const id = `${Date.now().toString(36)}m${Math.random().toString(36).slice(2, 8)}`;
    await putItem(token, { ...base, id, kind: 'message', text }, null);
  }
  return NextResponse.json({ ok: true, stored });
}
