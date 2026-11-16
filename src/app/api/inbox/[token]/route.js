import { NextResponse } from 'next/server';
import { inboxConfigured, listItems, validToken } from '../../../../lib/server/inbox-store.js';

// Lista lo que ha llegado al buzón (sin el contenido de los PDF)
export async function GET(req, { params }) {
  if (!inboxConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: 'bad_token' }, { status: 400 });
  return NextResponse.json({ items: await listItems(token) }, { headers: { 'cache-control': 'no-store' } });
}
