// Reclamos, montos honestos y copia cifrada (datos inventados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights } from '../src/lib/engine/insights.js';
import { buildClaim } from '../src/lib/engine/claims.js';
import { encryptBackup, decryptBackup } from '../src/lib/backup.js';

const docs = [{ id: 'd1', bank: 'Banco Demo', name: 'Banco Demo · Tarjeta *1111 · octubre 2026' }];
const T = (id, o) => ({ id, docId: 'd1', currency: 'COP', page: 1, line: `línea ${id}`, ...o });

const txs = [
  T('f1', { date: '2026-09-14', description: 'CUOTA DE MANEJO', amount: -34700, kind: 'fee', card: '1111' }),
  T('f2', { date: '2026-10-14', description: 'CUOTA DE MANEJO', amount: -34700, kind: 'fee', card: '1111' }),
  T('r1', { date: '2026-10-20', description: 'DEVOL CUOT MANEJO', amount: 34700, kind: 'refund', card: '1111' }),
  T('s1', { date: '2026-10-14', description: 'COBRO PRIMA SEGURO', amount: -4800, kind: 'insurance', card: '1111' }),
  T('s2', { date: '2026-10-20', description: 'CARGO CLIENTE PRIM SEG. SEGURO VIVIENDA', amount: -33000, kind: 'insurance' }),
  T('c1', { date: '2026-10-12', description: 'TIENDA DEMO', amount: -120000, kind: 'expense', card: '1111', installments: { current: 0, total: 36 }, rate: 28 }),
];

test('cuota de manejo: reclamo con lo cobrado, lo devuelto y lo pendiente', () => {
  const ins = buildInsights(txs, docs);
  const f = ins.find(i => i.id === 'fees-Banco Demo');
  assert.equal(f.amount, 34700);
  const c = buildClaim(f, Object.fromEntries(txs.map(t => [t.id, t])), { d1: docs[0] });
  assert.deepEqual(c.totals, { charged: 69400, refunded: 34700, pending: 34700 });
  assert.match(c.text, /Pendiente: \$\s?34\.700/);
  assert.match(c.text, /pág\. 1/); // cada cobro cita su extracto y página
});

test('el seguro de la tarjeta se puede reclamar; el del crédito no se presenta como recuperable', () => {
  const ins = buildInsights(txs, docs);
  const card = ins.find(i => i.id === 'insurance-Banco Demo');
  const loan = ins.find(i => i.id === 'insurance-loans');
  assert.equal(card.type, 'recover');
  assert.equal(card.amount, 4800);
  assert.equal(loan.type, 'info');
  assert.equal(loan.claim, undefined);
});

test('las compras a cuotas no se suman como plata perdida', () => {
  const f = buildInsights(txs, docs).find(i => i.id === 'deferred-Banco Demo');
  assert.equal(f.notLost, true);
  assert.equal(f.claim.kind, 'deferred');
});

test('copia cifrada: se restaura con la contraseña correcta y falla con otra', async () => {
  const data = { docs: { d1: docs[0] }, transactions: { f1: txs[0] }, claims: {}, settings: {} };
  const file = await encryptBackup(data, 'clave-larga-123');
  assert.doesNotMatch(file, /CUOTA DE MANEJO/);
  assert.deepEqual(await decryptBackup(file, 'clave-larga-123'), data);
  await assert.rejects(() => decryptBackup(file, 'otra'), /contraseña/);
});
