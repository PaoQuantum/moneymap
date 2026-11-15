import { NextResponse } from 'next/server';

/**
 * Respaldo con IA para extractos de bancos que todavía no tienen lector propio.
 * Recibe líneas YA anonimizadas en el navegador (sin cédula, cuentas, correo ni dirección)
 * y devuelve los movimientos citando el número de línea de donde salió cada uno.
 * El navegador descarta cualquier movimiento cuyo valor no aparezca en esa línea.
 */
export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  }
  const { lines } = await req.json();
  if (!Array.isArray(lines) || !lines.length) {
    return NextResponse.json({ error: 'no_lines' }, { status: 400 });
  }

  const text = lines.slice(0, 1500).map(l => `[${l.i}] ${l.text}`).join('\n');
  const system = `Lees extractos bancarios de Colombia. Cada línea empieza con su número entre corchetes.
Devuelve SOLO un JSON con esta forma:
{"bank": "nombre del banco", "product": "Cuenta de ahorros | Tarjeta de crédito | Crédito", "periodStart": "YYYY-MM-DD o null", "periodEnd": "YYYY-MM-DD o null",
 "transactions": [{"line": número de línea, "date": "YYYY-MM-DD o null", "description": "texto", "amount": número, "currency": "COP o USD"}]}
Reglas:
- amount negativo = plata que sale o cargo en la tarjeta; positivo = plata que entra, pago o abono a la tarjeta.
- Copia la descripción tal como aparece. No inventes movimientos ni fechas: si no ves la fecha, usa null.
- Solo incluye movimientos que estén escritos en una línea concreta, y cita esa línea.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'ai_error' }, { status: 502 });
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text || '{}';
  try {
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 502 });
  }
}
