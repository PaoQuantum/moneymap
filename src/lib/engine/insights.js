import { SPENDING_KINDS } from './classify.js';

/**
 * Hallazgos: cobros que puedes reclamar, costos que puedes evitar y alertas.
 * Cada hallazgo trae la lista de movimientos que lo prueban (evidence),
 * para que la persona pueda ver en qué extracto y en qué línea está cada cobro.
 */

// Un mismo movimiento puede aparecer en varios extractos (por ejemplo, compras a cuotas).
// Se deja la copia del extracto original (la cuota más baja) y se anotan los demás en `alsoIn`.
export function uniqueTransactions(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    const key = [t.card || t.docAccount || '', t.date, t.amount, t.currency, (t.description || '').toUpperCase()].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.values()].map(g => {
    if (g.length === 1) return g[0];
    const sorted = [...g].sort((a, b) => (a.installments?.current ?? 0) - (b.installments?.current ?? 0));
    return { ...sorted[0], alsoIn: sorted.slice(1).map(t => t.id) };
  });
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
      action: 'Te dejo el reclamo listo con la tabla de cobros: cópialo y envíalo al banco.',
      evidence: [...charged, ...refunded].map(t => t.id),
      claim: { kind: 'fees', bank, charged: charged.map(t => t.id), refunded: refunded.map(t => t.id) },
    });
  }

  // 2. Intereses de mora, por banco
  const late = txs.filter(t => t.kind === 'interest' && /MORA/i.test(t.description));
  for (const bank of [...new Set(late.map(bankOf))]) {
    const items = late.filter(t => bankOf(t) === bank);
    const due = docs.filter(d => d.dueDate && d.bank === bank).sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    out.push({
      id: `late-${bank}`,
      type: 'save',
      title: `Pagaste ${fmt(sum(items))} en intereses de mora con ${bank}`,
      amount: sum(items),
      currency: 'COP',
      body: 'Te cobran mora cuando pagas después de la fecha límite, aunque sea un día tarde. Si fue la primera vez, puedes pedir que te la reversen.'
        + (due ? ` Tu última fecha límite fue el ${fmtDate(due.dueDate)} (${due.name}).` : ''),
      action: 'Pide la reversión con el texto listo y programa el pago total el día 1 de cada mes.',
      evidence: items.map(t => t.id),
      claim: { kind: 'late', bank, charged: items.map(t => t.id) },
    });
  }

  // 3. Compras diferidas a muchas cuotas (pagas intereses por compras del día a día), por banco
  const deferred = txs.filter(t => t.kind === 'expense' && t.installments?.total > 1 && (t.rate == null || t.rate > 0));
  for (const bank of [...new Set(deferred.map(bankOf))]) {
    const items = deferred.filter(t => bankOf(t) === bank);
    const cur = byCurrency(items);
    const usd = items.filter(t => t.currency === 'USD');
    out.push({
      id: `deferred-${bank}`,
      type: 'save',
      title: `${items.length} compra${items.length > 1 ? 's' : ''} con ${bank} quedaron diferidas hasta a ${Math.max(...items.map(t => t.installments.total))} cuotas`,
      amount: cur.COP || 0,
      amountLabel: 'en compras a cuotas',
      notLost: true,
      currency: 'COP',
      extra: cur.USD ? `y US$ ${cur.USD.toFixed(2)} en dólares` : null,
      body: `Cada compra a cuotas paga intereses (cerca del 28 % efectivo anual). ${usd.length ? `Incluye ${usd.length} compras en dólares, como viajes de Uber de 1 o 2 dólares, que terminas pagando durante años. ` : ''}Muchas veces el banco las pone a cuotas por defecto.`,
      action: 'Pide que tus compras queden a 1 cuota por defecto y que pasen estas a 1 cuota. Te dejo el texto listo.',
      evidence: items.map(t => t.id),
      claim: { kind: 'deferred', bank, charged: items.map(t => t.id) },
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
      amountLabel: 'en avances',
      notLost: true,
      currency: 'COP',
      body: `Los avances cobran interés desde el primer día (cerca del 29 % efectivo anual)${advanceFees.length ? ` y además una comisión: pagaste ${fmt(sum(advanceFees))}` : ''}. Es la forma más cara de conseguir plata.`,
      action: 'Arma un colchón de emergencia con 1 o 2 meses de gastos fijos para no volver a necesitarlos.',
      evidence: [...advances, ...advanceFees].map(t => t.id),
    });
  }

  // 6. Seguros. Los de la tarjeta suelen ser "voluntarios" (se pueden cancelar y reclamar);
  //    los que se debitan de la cuenta casi siempre son del crédito (vida, vivienda) y son obligatorios.
  const insurance = txs.filter(t => t.kind === 'insurance' && t.amount < 0);
  const cardIns = insurance.filter(t => t.card);
  const loanIns = insurance.filter(t => !t.card);
  for (const bank of [...new Set(cardIns.map(bankOf))]) {
    const items = cardIns.filter(t => bankOf(t) === bank);
    out.push({
      id: `insurance-${bank}`,
      type: 'recover',
      title: `${bank} te cobra un seguro en la tarjeta (${items.length} ${items.length === 1 ? 'cobro' : 'cobros'})`,
      amount: sum(items),
      currency: 'COP',
      body: 'Los bancos suelen agregar seguros pequeños a la tarjeta. Si no lo pediste o no lo usas, puedes cancelarlo, y si no hay una autorización tuya, pedir que te devuelvan lo cobrado.',
      action: 'Pide la autorización firmada del seguro; si no existe, que lo cancelen y te devuelvan la plata.',
      evidence: items.map(t => t.id),
      claim: { kind: 'insurance', bank, charged: items.map(t => t.id) },
    });
  }
  if (loanIns.length) {
    out.push({
      id: 'insurance-loans',
      type: 'info',
      title: `Pagas ${fmt(sum(loanIns))} en seguros que se debitan de tu cuenta`,
      amount: sum(loanIns),
      amountLabel: 'en estos extractos',
      currency: 'COP',
      body: 'Normalmente son los seguros de un crédito (vida o vivienda). Son obligatorios, pero la ley te deja tomarlos con otra aseguradora si te sale más barato.',
      action: 'Cotiza el mismo seguro con otra aseguradora y, si es más barato, pide al banco el cambio (endoso).',
      evidence: loanIns.map(t => t.id),
    });
  }

  // 7. Cobros que se repiten cada mes (posibles suscripciones)
  const groups = {};
  for (const t of txs.filter(t => t.kind === 'expense' && !t.previousPeriod && t.date)) {
    const key = t.merchantKey || (t.description || '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
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
      amountLabel: 'al mes',
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
    const o = months[m] = months[m] || { month: m, income: 0, spending: 0, byCategory: {}, byMerchant: {}, count: 0 };
    o.count++;
    if (t.kind === 'income') o.income += t.amount;
    if (SPENDING_KINDS.has(t.kind) && t.amount < 0) {
      o.spending += -t.amount;
      o.byCategory[t.category] = (o.byCategory[t.category] || 0) - t.amount;
      if (t.kind === 'expense') {
        const k = t.merchantKey || t.description;
        const mm = o.byMerchant[k] = o.byMerchant[k] || { key: k, name: t.merchant || t.description, total: 0, count: 0, category: t.category };
        mm.total -= t.amount; mm.count++;
      }
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
