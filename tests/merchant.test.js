// Comercios normalizados y reglas aprendidas (datos inventados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant } from '../src/lib/engine/merchant.js';
import { addDocument, setMerchantRule, removeMerchantRule } from '../src/lib/store.js';
import { monthlySummary } from '../src/lib/engine/insights.js';

test('el mismo comercio escrito distinto por cada banco queda igual', () => {
  const keys = ['COMPRA EN MERCAR SEDE NORTE', 'MERCAR SEDE SUR', 'MERCAR SEDE NORTE'].map(d => normalizeMerchant(d).key);
  assert.equal(new Set(keys).size, 1);
  assert.equal(normalizeMerchant('COMPRA EN DOLLARCITY PASOAN').name, 'Dollarcity');
  assert.equal(normalizeMerchant('COMPRA EN www.etoro.com*Ana').name, 'eToro');
  assert.equal(normalizeMerchant('COMPRA EN eToro UK LTD').name, 'eToro');
});

test('pasarelas de pago: se toma la tienda real', () => {
  assert.equal(normalizeMerchant('BOLD SA*TIENDA LUNA').name, 'Tienda Luna');
  assert.equal(normalizeMerchant('SHEIN COM*DL').name, 'Shein');
});

test('sin sufijos legales ni números de cuenta en el nombre', () => {
  assert.equal(normalizeMerchant('PANADERIA LA ESPIGA SAS').name, 'Panaderia Espiga');
  assert.equal(normalizeMerchant('ABONO DOMI. 000009876543210').name, 'Sin comercio identificado');
});

const base = () => ({ docs: {}, transactions: {}, processedMessages: {}, settings: { names: [], rules: {} } });
const tx = (id, desc, amount, extra = {}) => {
  const m = normalizeMerchant(desc);
  return { id, docId: 'd1', date: '2026-10-0' + id.slice(-1), description: desc, amount, currency: 'COP', kind: 'expense', category: 'Otros gastos', merchant: m.name, merchantKey: m.key, ...extra };
};

test('una corrección con "aplicar a todos" cambia los existentes y los que lleguen', () => {
  let data = addDocument(base(), { doc: { id: 'd1' }, transactions: [tx('t1', 'TIENDA LUNA CENTRO', -50000), tx('t2', 'TIENDA LUNA NORTE', -30000)] }).data;
  data = setMerchantRule(data, 'TIENDA-LUNA', { category: 'Regalos' });
  assert.equal(data.transactions.t1.category, 'Regalos');
  assert.equal(data.transactions.t2.category, 'Regalos');
  // llega un extracto nuevo
  data = addDocument(data, { doc: { id: 'd2' }, transactions: [{ ...tx('t3', 'COMPRA EN TIENDA LUNA SUR', -10000), docId: 'd2' }] }).data;
  assert.equal(data.transactions.t3.category, 'Regalos');
  assert.ok(data.transactions.t3.ruleApplied);
});

test('marcar envíos a una persona como no-gasto los saca del gasto del mes', () => {
  let data = addDocument(base(), { doc: { id: 'd1' }, transactions: [tx('t1', 'TRANSFERENCIA A JUAN PEREZ', -200000), tx('t2', 'MERCAR SEDE NORTE', -100000, { category: 'Mercado' })] }).data;
  assert.equal(monthlySummary(Object.values(data.transactions))[0].spending, 300000);
  data = setMerchantRule(data, 'JUAN-PEREZ', { kind: 'transfer_out', category: 'Envíos a personas' });
  const [m] = monthlySummary(Object.values(data.transactions));
  assert.equal(m.spending, 100000);
  assert.equal(m.byMerchant.MERCAR.total, 100000);
});

test('quitar la regla devuelve la clasificación automática', () => {
  let data = addDocument(base(), { doc: { id: 'd1' }, transactions: [tx('t1', 'COMPRA EN MERCAR SEDE NORTE', -80000, { category: 'Mercado' })] }).data;
  data = setMerchantRule(data, 'MERCAR', { category: 'Hogar' });
  assert.equal(data.transactions.t1.category, 'Hogar');
  data = removeMerchantRule(data, 'MERCAR');
  assert.equal(data.transactions.t1.category, 'Mercado');
  assert.deepEqual(data.settings.rules, {});
});

test('compra a cuotas repetida en dos extractos: se muestra y se cuenta una vez', async () => {
  const { uniqueTransactions } = await import('../src/lib/engine/insights.js');
  const a = { id: 'a', card: '1111', date: '2026-07-12', amount: -135000, currency: 'COP', description: 'TIENDA DEMO', installments: { current: 0, total: 36 } };
  const b = { ...a, id: 'b', installments: { current: 1, total: 36 } };
  const u = uniqueTransactions([b, a]);
  assert.equal(u.length, 1);
  assert.equal(u[0].id, 'a');
  assert.deepEqual(u[0].alsoIn, ['b']);
});
