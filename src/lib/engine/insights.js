import { SPENDING_KINDS } from './classify.js';

/**
 * Hallazgos: cobros que puedes reclamar, costos que puedes evitar y alertas.
 * Cada hallazgo trae la lista de movimientos que lo prueban (evidence),
 * para que la persona pueda ver en qué extracto y en qué línea está cada cobro.
 */

// Un mismo movimiento puede aparecer en varios extractos (por ejemplo, compras a cuotas).
export function uniqueTransactions(transactions) {
  const seen = new Map();
  for (const t of transactions) {
    const key = [t.card || t.docAccount || '', t.date, t.amount, t.currency, (t.description || '').toUpperCase()].join('|');
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()];
}

const sum = arr => arr.reduce((s, t) => s + Math.abs(t.amount), 0);
const byCurrency = arr => arr.reduce((acc, t) => { acc[t.currency] = (acc[t.currency] || 0) + Math.abs(t.amount); return acc; }, {});

export function buildInsights(transactions, docs) {
  const txs = uniqueTransactions(transactions);
  const docById = Object.fromEntries(docs.map(d => [d.id, d]));
  const bankOf = t => docById[t.docId]?.bank || 'Banco';
  const out = [];

  // 1. Cuotas de manejo (y devoluciones), por banco
  const fees = txs.filter(t => /CUOTA DE MANEJO/i.test(t.description) && t.amount < 0);
  const feeRefunds = txs.filter(t => /DEVOL.*MANEJO/i.test(t.description) && t.amount > 0);
  const banks = [...new Set(fees.map(bankOf))];
  for (const bank of banks) {
    const charged = fees.filter(t => bankOf(t) === bank).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const refunded = feeRefunds.filter(t => bankOf(t) === bank);
    const net = sum(charged) - sum(refunded);
    out.push({
      id: `fees-${bank}`,
      type: 'recover',
      title: `${bank} te cobró ${charged.length} cuota${charged.length > 1 ? 's' : ''} de manejo`,
      amount: net,
      currency: 'COP',
      body: refunded.length
        ? `Te cobraron ${fmt(sum(charged))} y te devolvieron ${fmt(sum(refunded))}. Si te ofrecieron la tarjeta sin cuota de manejo, puedes pedir la devolución de los ${fmt(net)} restantes.`
        : `Si te ofrecieron la tarjeta sin cuota de manejo, o cumples la condición para que te la exoneren, puedes pedir que te devuelvan ${fmt(net)}.`,
      action: 'Arma tu reclamo con la tabla de cobros y llama al banco.',
      evidence: [...charged, ...refunded].map(t => t.id),
      claim: { bank, charged: charged.map(t => t.id), refunded: refunded.map(t => t.id) },
    });
  }

  // 2. Intereses de mora
  const late = txs.filter(t => t.kind === 'interest' && /MORA/i.test(t.description));
  if (late.length) {
    const due = docs.filter(d => d.dueDate).sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    out.push({
      id: 'late-interest',
      type: 'save',
      title: `Pagaste ${fmt(sum(late))} en intereses de mora`,
      amount: sum(late),
      currency: 'COP',
      body: 'Te cobran mora cuando pagas después de la fecha límite, aunque sea un día tarde.'
        + (due ? ` Tu última fecha límite fue el ${fmtDate(due.dueDate)} (${due.name}).` : ''),
      action: 'Programa el pago completo el día 1 de cada mes o activa el débito automático por el pago total.',
      evidence: late.map(t => t.id),
    });
  }

  // 3. Compras diferidas a muchas cuotas (pagas intereses por compras del día a día)
  const deferred = txs.filter(t => t.kind === 'expense' && t.installments?.total > 1 && (t.rate == null || t.rate > 0));
  if (deferred.length) {
    const cur = byCurrency(deferred);
    const usd = deferred.filter(t => t.currency === 'USD');
    out.push({
      id: 'deferred',
      type: 'save',
      title: `${deferred.length} compras quedaron diferidas hasta a ${Math.max(...deferred.map(t => t.installments.total))} cuotas`,
      amount: cur.COP || 0,
      currency: 'COP',
      extra: cur.USD ? `y US$ ${cur.USD.toFixed(2)} en dólares` : null,
      body: `Cada compra a cuotas paga intereses (cerca del 28 % efectivo anual). ${usd.length ? `Incluye ${usd.length} compras en dólares, como viajes de Uber de 1 o 2 dólares, que terminas pagando durante años. ` : ''}Muchas veces el banco las pone a cuotas por defecto.`,
      action: 'Pide al banco que tus compras queden a 1 cuota por defecto, y paga hoy el saldo de las compras pequeñas.',
      evidence: deferred.map(t => t.id),
    });
  }

  // 4. Intereses corrientes
  const interest = txs.filter(t => t.kind === 'interest' && /CORRIENTES/i.test(t.description));
  if (interest.length) {
    const cur = byCurrency(interest);
    out.push({
      id: 'interest',
      type: 'save',
      title: 'Estás pagando intereses por compras a cuotas',
      amount: cur.COP || 0,
      currency: 'COP',
      extra: cur.USD ? `US$ ${cur.USD.toFixed(2)}` : null,
      body: 'Son los intereses de las compras y avances que tienes diferidos.',
      action: 'Abona a capital las deudas con tasa más alta o paga el total de la tarjeta cada mes.',
      evidence: interest.map(t => t.id),
    });
  }

  // 5. Avances
  const advances = txs.filter(t => t.kind === 'cash_advance' && t.amount < 0);
  const advanceFees = txs.filter(t => t.kind === 'fee' && /AVANCE/i.test(t.description));
  if (advances.length) {
    out.push({
      id: 'advances',
      type: 'warning',
      title: `Sacaste ${advances.length} avance${advances.length > 1 ? 's' : ''} por ${fmt(sum(advances))}`,
      amount: sum(advances) + sum(advanceFees),
      currency: 'COP',
      body: `Los avances cobran interés desde el primer día (cerca del 29 % efectivo anual)${advanceFees.length ? ` y además una comisión: pagaste ${fmt(sum(advanceFees))}` : ''}. Es la forma más cara de conseguir plata.`,
      action: 'Arma un colchón de emergencia con 1 o 2 meses de gastos fijos para no volver a necesitarlos.',
      evidence: [...advances, ...advanceFees].map(t => t.id),
    });
  }

  // 6. Seguros cobrados en tarjetas y cuentas
  const insurance = txs.filter(t => t.kind === 'insurance');
  const smallCardInsurance = insurance.filter(t => t.card);
  if (smallCardInsurance.length) {
    out.push({
      id: 'insurance',
      type: 'save',
      title: 'Tienes seguros cobrados en tu tarjeta',
      amount: sum(smallCardInsurance),
      currency: 'COP',
      body: 'Los bancos suelen agregar seguros pequeños a la tarjeta. Revisa si los pediste y si los necesitas.',
      action: 'Si no lo pediste, llama al banco y pide cancelarlo.',
      evidence: smallCardInsurance.map(t => t.id),
    });
  }

  // 7. Cobros que se repiten cada mes (posibles suscripciones)
  const groups = {};
  for (const t of txs.filter(t => t.kind === 'expense' && !t.previousPeriod && t.date)) {
    const key = (t.description || '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
    (groups[key] = groups[key] || []).push(t);
  }
  const recurring = Object.values(groups).filter(g => {
    const months = new Set(g.map(t => t.date.slice(0, 7)));
    const avg = sum(g) / g.length;
    return months.size >= 2 && g.every(t => Math.abs(Math.abs(t.amount) - avg) / avg < 0.2) && g[0].category === 'Suscripciones';
  });
  if (recurring.length) {
    const flat = recurring.flat();
    out.push({
      id: 'recurring',
      type: 'info',
      title: `${recurring.length} cobro${recurring.length > 1 ? 's' : ''} que se repite${recurring.length > 1 ? 'n' : ''} cada mes`,
      amount: recurring.reduce((s, g) => s + Math.abs(g[g.length - 1].amount), 0),
      currency: 'COP',
      body: 'Parecen suscripciones. Revisa si las sigues usando.',
      action: 'Cancela las que no uses.',
      evidence: flat.map(t => t.id),
    });
  }

  // 8. Movimientos que necesitan tu revisión
  const review = transactions.filter(t => t.needsReview);
  if (review.length) {
    out.push({
      id: 'review',
      type: 'info',
      title: `${review.length} movimiento${review.length > 1 ? 's' : ''} para revisar`,
      amount: null,
      body: 'No pude confirmar algún dato. No lo inventé: lo dejé marcado para que lo revises.',
      action: 'Revísalos en Movimientos.',
      evidence: review.map(t => t.id),
    });
  }

  const order = { recover: 0, save: 1, warning: 2, info: 3 };
  return out.sort((a, b) => order[a.type] - order[b.type] || (b.amount || 0) - (a.amount || 0));
}

/** Resumen por mes: ingresos, gasto real (sin pagos de tarjeta ni movimientos propios) y categorías. */
export function monthlySummary(transactions) {
  const txs = uniqueTransactions(transactions).filter(t => t.date && t.currency === 'COP' && !t.previousPeriod);
  const months = {};
  for (const t of txs) {
    const m = t.date.slice(0, 7);
    const o = months[m] = months[m] || { month: m, income: 0, spending: 0, byCategory: {}, count: 0 };
    o.count++;
    if (t.kind === 'income') o.income += t.amount;
    if (SPENDING_KINDS.has(t.kind) && t.amount < 0) {
      o.spending += -t.amount;
      o.byCategory[t.category] = (o.byCategory[t.category] || 0) - t.amount;
    }
  }
  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

export function fmt(n, currency = 'COP') {
  if (n == null) return '—';
  if (currency === 'USD') return `US$ ${Number(n).toFixed(2)}`;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(iso) {
  if (!iso) return 'fecha sin leer';
  const [y, m, d] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}
