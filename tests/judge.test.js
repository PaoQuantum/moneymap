// El "juez" de la lectura con IA (datos inventados, IA simulada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeExtraction } from '../src/lib/engine/judge.js';
import { processLines } from '../src/lib/parsers/index.js';

const lines = [
  'BANCO EJEMPLO S.A.   EXTRACTO CUENTA DE AHORROS',
  'SALDO ANTERIOR   1.000.000,00',
  '03/10/2026   COMPRA TIENDA DEMO   -150.000,00',
  '10/10/2026   PAGO NOMINA EMPRESA DEMO   2.000.000,00',
  '15/10/2026   RETIRO CAJERO   -50.000,00',
  'TOTAL DEBITOS   200.000,00     TOTAL CREDITOS   2.000.000,00',
  'SALDO FINAL   2.800.000,00',
].map(text => ({ page: 1, text }));

const goodAi = {
  bank: 'Banco Ejemplo', product: 'Cuenta de ahorros',
  totals: {
    openingBalance: { value: 1000000, line: 1 },
    closingBalance: { value: 2800000, line: 6 },
    totalCharges: { value: 200000, line: 5 },
    totalCredits: { value: 2000000, line: 5 },
  },
  transactions: [
    { line: 2, date: '2026-10-03', description: 'COMPRA TIENDA DEMO', amount: -150000, currency: 'COP' },
    { line: 3, date: '2026-10-10', description: 'PAGO NOMINA EMPRESA DEMO', amount: 2000000, currency: 'COP' },
    { line: 4, date: '2026-10-15', description: 'RETIRO CAJERO', amount: -50000, currency: 'COP' },
  ],
};

test('si los totales cuadran, el extracto queda verificado', () => {
  const r = judgeExtraction(goodAi, lines);
  assert.equal(r.verified, true);
  assert.equal(r.transactions.length, 3);
  assert.ok(r.transactions.every(t => !t.needsReview));
});

test('un movimiento inventado se descarta y nada queda verificado', () => {
  const ai = { ...goodAi, transactions: [...goodAi.transactions, { line: 2, date: '2026-10-20', description: 'INVENTADO', amount: -999999 }] };
  const r = judgeExtraction(ai, lines);
  assert.equal(r.rejected, 1);
  assert.equal(r.verified, false);
  assert.ok(r.transactions.every(t => t.needsReview));
});

test('si falta un movimiento, los totales no cuadran y se marca para revisar', () => {
  const ai = { ...goodAi, transactions: goodAi.transactions.slice(0, 2) };
  const r = judgeExtraction(ai, lines);
  assert.equal(r.verified, false);
  assert.match(r.check.label, /no cuadran/);
});

test('un total que no está escrito en la línea citada no cuenta', () => {
  const ai = { ...goodAi, transactions: goodAi.transactions.slice(0, 2), totals: { closingBalance: { value: 2850000, line: 6 }, openingBalance: { value: 1000000, line: 1 } } };
  const r = judgeExtraction(ai, lines);
  assert.equal(r.verified, false);
});

test('banco desconocido: processLines usa la IA y respeta al juez', async () => {
  const llm = async (ls) => ({ bank: 'Banco Ejemplo', product: 'Cuenta de ahorros', ...judgeExtraction(goodAi, ls), periodEnd: '2026-10-31' });
  const r = await processLines({ lines, pages: 1, filename: 'x.pdf', llm });
  assert.ok(r.ok);
  assert.equal(r.doc.method, 'ai');
  assert.equal(r.doc.check.ok, true);
  assert.match(r.doc.name, /Banco Ejemplo · Cuenta de ahorros · octubre 2026/);
});

test('banco desconocido sin IA: lo dice claramente', async () => {
  const llm = async () => { const e = new Error('x'); e.code = 'AI_NOT_CONFIGURED'; throw e; };
  const r = await processLines({ lines, pages: 1, filename: 'x.pdf', llm });
  assert.equal(r.ok, false);
  assert.match(r.message, /IA no está activada/);
});

test('un PDF que no es extracto no se guarda y lo dice claro', async () => {
  const llm = async () => ({ isStatement: false, empty: true, transactions: [], check: { ok: false, label: '' } });
  const r = await processLines({ lines, pages: 1, filename: 'receta.pdf', llm });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_statement');
});

test('si la IA no logra leer nada comprobable, no se guarda un extracto vacío', async () => {
  const llm = async () => ({ isStatement: true, empty: true, transactions: [], check: { ok: false, label: '' } });
  const r = await processLines({ lines, pages: 1, filename: 'x.pdf', llm });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unreadable');
});

test('extracto sin movimientos (saldo inicial = final) sí es válido', () => {
  const ls = ['BANCO EJEMPLO', 'SALDO ANTERIOR 500.000,00', 'SALDO FINAL 500.000,00'].map(text => ({ page: 1, text }));
  const r = judgeExtraction({ transactions: [], totals: { openingBalance: { value: 500000, line: 1 }, closingBalance: { value: 500000, line: 2 } } }, ls);
  assert.equal(r.emptyMonth, true);
  assert.equal(r.check.ok, true);
});

test('formato nuevo de cuotas (installmentTotal) se conserva', () => {
  const ai = { ...goodAi, transactions: [{ ...goodAi.transactions[0], installmentCurrent: 1, installmentTotal: 12 }, ...goodAi.transactions.slice(1)] };
  const r = judgeExtraction(ai, lines);
  assert.deepEqual(r.transactions[0].installments, { current: 1, total: 12 });
});
