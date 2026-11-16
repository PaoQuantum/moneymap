import { verifyAgainstLine } from './redact.js';

/**
 * "Juez" de lo que lee la IA. La IA puede leer cualquier banco, pero no se le cree:
 *
 *  1. Cada movimiento debe citar una línea del PDF y su valor debe estar escrito en esa línea.
 *  2. Los totales del extracto (saldo inicial, saldo final, total de cargos, total de abonos)
 *     también deben estar escritos en la línea que la IA cita.
 *  3. Las cuentas tienen que cuadrar (todas las que se puedan comprobar):
 *     - cuenta:  saldo inicial + movimientos = saldo final
 *     - tarjeta: suma de cargos = total de cargos, o suma de abonos = total de abonos
 *
 * Si cuadra, el extracto queda "verificado". Si no, se guarda lo comprobado
 * pero todo queda marcado para revisar. Nunca se completa nada a ojo.
 */

const TOL = 1; // un peso de tolerancia por redondeos

function citedTotal(total, lines) {
  if (!total || total.value == null || !Number.isFinite(Number(total.value))) return null;
  const line = lines[total.line];
  if (!line || !verifyAgainstLine({ amount: Number(total.value) }, line)) return null;
  return Math.abs(Number(total.value));
}

export function judgeExtraction(ai, lines) {
  const accepted = [];
  let rejected = 0;
  for (const t of ai.transactions || []) {
    const line = lines[t.line];
    const amount = Number(t.amount);
    if (Number.isFinite(amount) && amount !== 0 && verifyAgainstLine({ amount }, line)) {
      accepted.push({
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null,
        description: String(t.description || '').slice(0, 120),
        amount,
        currency: t.currency === 'USD' ? 'USD' : 'COP',
        page: line.page,
        line: line.text,
        installments: (t.installmentTotal ?? t.installments?.total) > 1
          ? { current: Number(t.installmentCurrent ?? t.installments?.current) || 0, total: Number(t.installmentTotal ?? t.installments.total) }
          : null,
      });
    } else {
      rejected++;
    }
  }

  const totals = ai.totals || {};
  const opening = citedTotal(totals.openingBalance, lines);
  const closing = citedTotal(totals.closingBalance, lines);
  const charges = citedTotal(totals.totalCharges, lines);
  const credits = citedTotal(totals.totalCredits, lines);
  const cop = accepted.filter(t => t.currency === 'COP');
  const sum = cop.reduce((a, t) => a + t.amount, 0);
  const sumCharges = cop.filter(t => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const sumCredits = cop.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0);

  const checks = [];
  if (opening != null && closing != null) {
    // El saldo inicial puede ser negativo en una tarjeta; se prueban ambos signos
    const ok = Math.abs(opening + sum - closing) <= TOL || Math.abs(-opening + sum + closing) <= TOL;
    checks.push({ name: 'saldo', ok });
  }
  if (charges != null) checks.push({ name: 'cargos', ok: Math.abs(sumCharges - charges) <= TOL });
  if (credits != null) checks.push({ name: 'abonos', ok: Math.abs(sumCredits - credits) <= TOL });

  const passed = checks.filter(c => c.ok).map(c => c.name);
  // Verificado solo si al menos una comprobación pasa y NINGUNA falla
  const failed = checks.filter(c => !c.ok);
  const verified = passed.length > 0 && failed.length === 0 && rejected === 0 && accepted.length > 0;

  let label;
  const emptyMonth = !accepted.length && !rejected && opening != null && closing != null && Math.abs(opening - closing) <= TOL;
  if (emptyMonth) label = 'Extracto sin movimientos: el saldo inicial y el final son iguales.';
  else if (!accepted.length) label = 'La IA no encontró movimientos que se puedan comprobar en el PDF.';
  else if (verified) label = `Leído con IA y verificado: ${passed.map(n => ({ saldo: 'el saldo inicial más los movimientos da el saldo final', cargos: 'la suma de cargos coincide con el total del extracto', abonos: 'la suma de abonos coincide con el total del extracto' })[n]).join(' y ')}.`;
  else if (rejected) label = `Leído con IA. Descarté ${rejected} movimiento(s) que no estaban escritos en el PDF; revisa que no falte ninguno.`;
  else if (checks.length) label = 'Leído con IA, pero los totales no cuadran: puede faltar algún movimiento. Quedan marcados para revisar.';
  else label = 'Leído con IA. Cada movimiento está en el PDF, pero no encontré totales para comprobar que estén todos.';

  return {
    transactions: accepted.map(t => verified ? t : { ...t, needsReview: true, reviewReason: 'Leído con IA sin poder cuadrar los totales: revisa que esté bien.' }),
    rejected,
    verified,
    emptyMonth,
    check: { ok: verified || emptyMonth, label },
  };
}
