import { NextResponse } from 'next/server';

/**
 * Lector universal con IA para extractos de bancos sin lector propio.
 * Recibe líneas YA anonimizadas en el navegador (sin cédula, cuentas, correo ni dirección)
 * y devuelve los movimientos citando el número de línea de donde salió cada uno.
 * El navegador (judge.js) descarta todo lo que no esté escrito en esa línea.
 */
export const maxDuration = 120;

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const MAX_LINES = 1500;
const MAX_CHARS = 150000;

const nullable = type => ({ type: [type, 'null'] });
const cited = {
  anyOf: [
    { type: 'null' },
    { type: 'object', properties: { value: { type: 'number' }, line: { type: 'integer' } }, required: ['value', 'line'], additionalProperties: false },
  ],
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isBankStatement', 'bank', 'product', 'accountLast4', 'periodStart', 'periodEnd', 'dueDate', 'totals', 'transactions'],
  properties: {
    isBankStatement: { type: 'boolean' },
    bank: nullable('string'),
    product: nullable('string'),
    accountLast4: nullable('string'),
    periodStart: nullable('string'),
    periodEnd: nullable('string'),
    dueDate: nullable('string'),
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['openingBalance', 'closingBalance', 'totalCharges', 'totalCredits'],
      properties: { openingBalance: cited, closingBalance: cited, totalCharges: cited, totalCredits: cited },
    },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'date', 'description', 'amount', 'currency', 'installmentCurrent', 'installmentTotal'],
        properties: {
          line: { type: 'integer' },
          date: nullable('string'),
          description: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string', enum: ['COP', 'USD'] },
          installmentCurrent: nullable('integer'),
          installmentTotal: nullable('integer'),
        },
      },
    },
  },
};

const SYSTEM = `Lees extractos bancarios de Colombia (cualquier banco: cuentas de ahorro o corrientes, tarjetas de crédito, créditos, billeteras).
Cada línea empieza con su número entre corchetes. Los datos personales vienen tapados.
Devuelve SOLO un objeto JSON (sin texto antes ni después) con esta forma:
{
 "isBankStatement": true si el texto es un extracto o estado de cuenta de un producto financiero; false si es otra cosa,
 "bank": "nombre del banco o entidad, o null si no aparece",
 "product": "Cuenta de ahorros | Cuenta corriente | Tarjeta de crédito | Crédito | otro",
 "accountLast4": "últimos 4 dígitos visibles del producto o null",
 "periodStart": "YYYY-MM-DD o null", "periodEnd": "YYYY-MM-DD o null (fecha de corte)", "dueDate": "YYYY-MM-DD o null",
 "totals": {
   "openingBalance": {"value": número, "line": número} o null,
   "closingBalance": {"value": número, "line": número} o null,
   "totalCharges":   {"value": número, "line": número} o null,
   "totalCredits":   {"value": número, "line": número} o null
 },
 "transactions": [{"line": número, "date": "YYYY-MM-DD o null", "description": "texto", "amount": número, "currency": "COP" o "USD",
                   "installmentCurrent": número o null, "installmentTotal": número o null}]
}
Reglas:
- amount negativo = plata que sale (débito, compra, cargo); positivo = plata que entra (crédito, abono, pago a la tarjeta).
- Si la tabla tiene columnas DÉBITOS y CRÉDITOS, usa la que no sea cero. Incluye TODAS las filas, aunque sean de centavos.
- Los números pueden venir como 1,234.56 o 1.234,56: conviértelos a número (1234.56).
- Si las filas solo traen el día, completa mes y año con el periodo o la fecha de corte del extracto.
- openingBalance = saldo anterior o inicial; closingBalance = saldo actual o final.
- totalCharges y totalCredits son los totales que imprime el banco (por ejemplo "Total débitos", "- 2 DEBITOS", "Compras del mes"). No los calcules tú: si no están escritos, usa null.
- Cita siempre el número de línea exacto de cada movimiento y de cada total.
- Copia la descripción tal como aparece. No inventes movimientos, fechas ni totales.
- No incluyas saldos ni totales como movimientos.`;

async function callModel(text, structured) {
  const body = {
    model: MODEL(),
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  };
  if (structured) body.output_config = { format: { type: 'json_schema', schema: SCHEMA } };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

// Busca el JSON en la respuesta, venga en el bloque que venga y aunque traiga texto alrededor
function parseAnswer(data) {
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function extract(text) {
  const diag = { model: MODEL(), structured: true };
  let res = await callModel(text, true);
  if (res.status === 400) {
    // Modelo o cuenta sin salida estructurada: se pide JSON por instrucción
    diag.structured = false;
    res = await callModel(text, false);
  }
  diag.status = res.status;
  if (!res.ok) {
    let type = null;
    try { type = (await res.json())?.error?.type || null; } catch { /* sin detalle */ }
    diag.errorType = type;
    return { diag, json: null };
  }
  const data = await res.json();
  diag.stopReason = data.stop_reason;
  diag.blocks = (data.content || []).map(b => b.type);
  diag.outputTokens = data.usage?.output_tokens;
  const json = parseAnswer(data);
  diag.parsed = !!json;
  return { diag, json };
}

const AI_ERRORS = {
  401: 'La clave de la IA no es válida.',
  403: 'La clave de la IA no tiene permiso para este modelo.',
  404: 'El modelo de IA configurado no existe.',
  429: 'La IA está ocupada o se acabó el saldo. Intenta de nuevo en un momento.',
  529: 'La IA está saturada. Intenta de nuevo en un momento.',
};

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 501 });
  }
  // Solo la propia app puede usar este servicio (evita que otros sitios gasten el saldo de IA)
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin) {
    let originHost = null;
    try { originHost = new URL(origin).host; } catch { /* origen inválido */ }
    if (originHost !== host) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { lines } = await req.json();
  if (!Array.isArray(lines) || !lines.length) {
    return NextResponse.json({ error: 'no_lines', message: 'Este PDF no tiene texto que se pueda leer (puede ser una foto o un escaneo).' }, { status: 400 });
  }
  const text = lines.slice(0, MAX_LINES).map(l => `[${l.i}] ${String(l.text).slice(0, 400)}`).join('\n').slice(0, MAX_CHARS);

  const { diag, json } = await extract(text);
  // Solo diagnóstico técnico, nunca el contenido del extracto
  console.log('[extract]', JSON.stringify({ ...diag, lines: lines.length }));

  if (!json) {
    const message = AI_ERRORS[diag.status]
      || (diag.stopReason === 'max_tokens' ? 'Este extracto es demasiado largo para la lectura con IA.' : 'La IA no devolvió una respuesta que se pueda usar. Intenta de nuevo.');
    return NextResponse.json({ error: 'ai_error', message, diag }, { status: 502 });
  }
  return NextResponse.json({ ...json, truncated: lines.length > MAX_LINES });
}

/**
 * Autoprueba: GET /api/extract lee un extracto inventado de 3 movimientos y dice si la IA responde bien.
 * Sirve para saber si la clave, el modelo y el saldo están funcionando. Máximo una vez por minuto.
 */
let lastSelfTest = 0;
export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, reason: 'not_configured' });
  if (Date.now() - lastSelfTest < 60000) return NextResponse.json({ ok: null, reason: 'wait_a_minute' }, { status: 429 });
  lastSelfTest = Date.now();
  const sample = [
    'BANCO EJEMPLO S.A.   EXTRACTO CUENTA DE AHORROS   FECHA DE CORTE: 31/10/2026',
    'SALDO ANTERIOR   1,000,000.00',
    'DIA   TRANSACCION   DEBITOS   CREDITOS   SALDO',
    '03   COMPRA TIENDA DEMO   150,000.00   0.00   850,000.00',
    '10   PAGO NOMINA EMPRESA DEMO   0.00   2,000,000.00   2,850,000.00',
    '15   RETIRO CAJERO   50,000.00   0.00   2,800,000.00',
    'SALDO ACTUAL   2,800,000.00',
  ].map((t, i) => `[${i}] ${t}`).join('\n');
  const { diag, json } = await extract(sample);
  const amounts = (json?.transactions || []).map(t => t.amount);
  const ok = !!json && json.isBankStatement !== false && amounts.length === 3
    && amounts.includes(-150000) && amounts.includes(2000000) && amounts.includes(-50000);
  return NextResponse.json({ ok, diag, bank: json?.bank ?? null, transactions: amounts.length, periodEnd: json?.periodEnd ?? null });
}
