// Corre todos los extractos sintéticos por el lector real y compara con lo esperado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processLines } from '../src/lib/parsers/index.js';
import { FIXTURES } from './fixtures/statements.js';

for (const f of FIXTURES) {
  test(`lector: ${f.name}`, async () => {
    const r = await processLines({ lines: f.lines, pages: 1, filename: 'sintetico.pdf' });
    assert.ok(r.ok, r.message);
    const e = f.expect;
    assert.equal(r.doc.parserId, e.parserId);
    assert.equal(r.transactions.length, e.count, 'cantidad de movimientos');
    if ('checkOk' in e) assert.equal(r.doc.check.ok, e.checkOk, r.doc.check.label);
    if (e.period) assert.equal(r.doc.period, e.period);
    if (e.due) assert.equal(r.doc.dueDate, e.due);
    if (e.cards) assert.deepEqual(r.doc.cards, e.cards);
    if (e.last4) assert.equal(r.doc.accountLast4, e.last4);
    if (e.previous != null) assert.equal(r.transactions.filter(t => t.previousPeriod).length, e.previous);
    if (e.usd != null) assert.equal(r.transactions.filter(t => t.currency === 'USD').length, e.usd);
    if (e.kinds) {
      const got = {};
      for (const t of r.transactions) got[t.kind] = (got[t.kind] || 0) + 1;
      assert.deepEqual(got, e.kinds);
    }
    // Trazabilidad: todo movimiento trae su línea y su página
    for (const t of r.transactions) { assert.ok(t.line); assert.ok(t.page >= 1); }
  });
}
