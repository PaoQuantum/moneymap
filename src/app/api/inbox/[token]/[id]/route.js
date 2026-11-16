import { NextResponse } from 'next/server';
import { inboxConfigured, getContent, deleteItem, validToken } from '../../../../../lib/server/inbox-store.js';

// Descarga un PDF del buzón (el navegador lo abre y lo procesa)
export async function GET(req, { params }) {
  if (!inboxConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  const { token, id } = await params;
  if (!validToken(token)) return NextResponse.json({ error: 'bad_token' }, { status: 400 });
  const b64 = await getContent(token, id);
  if (!b64) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new Response(Buffer.from(b64, 'base64'), { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' } });
}

// Borra del buzón (se llama apenas el navegador termina de importar)
export async function DELETE(req, { params }) {
  if (!inboxConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  const { token, id } = await params;
  if (!validToken(token)) return NextResponse.json({ error: 'bad_token' }, { status: 400 });
  await deleteItem(token, id);
  return NextResponse.json({ ok: true });
}
