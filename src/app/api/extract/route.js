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
  const system = `Lees extractos bancarios de Colombia (cualquier banco: cuentas, tarjetas de crédito, créditos).
Cada línea empieza con su número entre corchetes. Los datos personales vienen tapados.
Devuelve SOLO un JSON con esta forma:
{
 "bank": "nombre del banco",
 "product": "Cuenta de ahorros | Cuenta corriente | Tarjeta de crédito | Crédito",
 "accountLast4": "últimos 4 dígitos visibles del producto o null",
 "periodStart": "YYYY-MM-DD o null", "periodEnd": "YYYY-MM-DD o null", "dueDate": "YYYY-MM-DD o null",
 "totals": {
   "openingBalance": {"value": número, "line": número} o null,
   "closingBalance": {"value": número, "line": número} o null,
   "totalCharges":   {"value": número, "line": número} o null,
   "totalCredits":   {"value": número, "line": número} o null
 },
 "transactions": [{"line": número, "date": "YYYY-MM-DD o null", "description": "texto", "amount": número, "currency": "COP o USD",
                   "installments": {"current": número, "total": número} o null}]
}
Reglas:
- amount negativo = plata que sale o cargo en la tarjeta; positivo = plata que entra, pago o abono a la tarjeta.
- totalCharges y totalCredits son los totales que imprime el banco (por ejemplo "Total compras del mes", "Total débitos", "Total créditos"). No los calcules tú: si no están escritos, usa null.
- Cita siempre la línea exacta de cada movimiento y de cada total.
- Copia la descripción tal como aparece. No inventes movimientos, fechas ni totales: si no los ves, usa null.
- No incluyas el saldo ni los totales como movimientos.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 16000,
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
