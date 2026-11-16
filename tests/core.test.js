// Pruebas con datos inventados (ningún dato real de usuarios).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processLines } from '../src/lib/parsers/index.js';
import { toISODate, parseCONumber, parseUSNumber } from '../src/lib/parsers/utils.js';
import { classify, SPENDING_KINDS } from '../src/lib/engine/classify.js';
import { buildInsights, monthlySummary } from '../src/lib/engine/insights.js';
import { redactLine, verifyAgainstLine } from '../src/lib/engine/redact.js';

const L = (texts) => texts.map(text => ({ page: 1, text }));

test('fechas inválidas no se inventan (quedan en null)', () => {
  assert.equal(toISODate('31', '02', '2026'), null);
  assert.equal(toISODate('15', '10', '2026'), '2026-10-15');
});

test('números en formato colombiano y gringo', () => {
  assert.equal(parseCONumber('1.234.567,89'), 1234567.89);
  assert.equal(parseUSNumber('1,234,567.89'), 1234567.89);
});

test('cuenta BBVA: el signo sale del saldo y el extracto cuadra', async () => {
  const lines = L([
    'CUENTA DE AHORROS',
    'PERIODO DESDE: 01-10-2026 HASTA: 31-10-2026',
    'SALDO CIERRE MES ANTERIOR 1,000,000.00',
    '01-10-2026 01-10-2026 ABONO NOMINA EMPRESA X   2,000,000.00   3,000,000.00',
    '05-10-2026 05-10-2026 PAGO TARJETA CREDITO   500,000.00   2,500,000.00',
    '07-10-2026 07-10-2026 COMPRA SUPERMERCADO DEMO   100,000.00   2,400,000.00',
    'SALDO FINAL 2,400,000.00',
  ]);
  const r = await processLines({ lines, pages: 1, filename: 'demo.pdf', origin: { type: 'upload' } });
  assert.ok(r.ok);
  assert.equal(r.transactions.length, 3);
  assert.equal(r.transactions[0].amount, 2000000);
  assert.equal(r.transactions[1].amount, -500000);
  assert.ok(r.doc.check.ok, 'debe cuadrar saldo inicial + movimientos = saldo final');
  assert.match(r.doc.name, /BBVA/);
  assert.match(r.doc.name, /octubre 2026/);
  // trazabilidad: cada movimiento guarda su línea original y página
  for (const t of r.transactions) { assert.ok(t.line); assert.equal(t.page, 1); }
});

test('formato desconocido sin IA: se dice claramente, no se inventa nada', async () => {
  const r = await processLines({ lines: L(['Banco Imaginario', 'hola']), pages: 1, filename: 'x.pdf' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unsupported');
});

test('pago de tarjeta no cuenta como gasto (evita doble conteo)', () => {
  const t = classify({ description: 'PAGO TARJETA CREDITO', amount: -500000 });
  assert.equal(SPENDING_KINDS.has(t.kind), false);
  const c = classify({ description: 'CUOTA DE MANEJO', amount: -34700 });
  assert.equal(c.kind, 'fee');
});

test('resumen mensual excluye pagos de tarjeta', () => {
  const txs = [
    { id: 'a', date: '2026-10-01', description: 'NOMINA', amount: 2000000, currency: 'COP', kind: 'income', category: 'Ingresos' },
    { id: 'b', date: '2026-10-05', description: 'PAGO TARJETA', amount: -500000, currency: 'COP', kind: 'card_payment', category: 'Pago de tarjeta' },
    { id: 'c', date: '2026-10-07', description: 'MERCADO', amount: -100000, currency: 'COP', kind: 'expense', category: 'Mercado' },
  ];
  const [m] = monthlySummary(txs);
  assert.equal(m.income, 2000000);
  assert.equal(m.spending, 100000);
});

test('hallazgos traen evidencia (ids de movimientos)', () => {
  const txs = [
    { id: 'f1', docId: 'd1', date: '2026-10-15', description: 'CUOTA DE MANEJO', amount: -34700, currency: 'COP', kind: 'fee', category: 'Cuota de manejo', card: '1234' },
  ];
  const docs = [{ id: 'd1', bank: 'Banco Demo', name: 'Banco Demo · Tarjeta *1234 · octubre 2026' }];
  const ins = buildInsights(txs, docs);
  const f = ins.find(i => /manejo/i.test(i.title));
  assert.ok(f);
  assert.deepEqual(f.evidence, ['f1']);
});

test('redacción oculta correos y números de cuenta, pero no montos ni fechas', () => {
  const out = redactLine('Juana Pérez juana@correo.com cuenta 0013012345678901 01-10-2026 $1.234.567', { names: ['Juana Pérez'] });
  assert.doesNotMatch(out, /juana@correo\.com/);
  assert.doesNotMatch(out, /Juana Pérez/);
  assert.doesNotMatch(out, /0013012345678901/);
  assert.match(out, /8901/);
  assert.match(out, /01-10-2026/);
  assert.match(out, /1\.234\.567/);
});

test('anti-alucinación: el monto debe aparecer en la línea citada', () => {
  assert.ok(verifyAgainstLine({ amount: -45900 }, { text: 'COMPRA TIENDA DEMO 45.900,00' }));
  assert.equal(verifyAgainstLine({ amount: -99999 }, { text: 'COMPRA TIENDA DEMO 45.900,00' }), false);
});

test('intereses que entran a una cuenta son rendimientos; el GMF es un impuesto', () => {
  assert.equal(classify({ description: 'INTERESES LIQUIDADOS', amount: 0.01 }).category, 'Rendimientos');
  assert.equal(classify({ description: 'INTERESES LIQUIDADOS', amount: 0.01 }).kind, 'income');
  assert.equal(classify({ description: 'GMF', amount: -104.72 }).category, 'Impuestos');
});
