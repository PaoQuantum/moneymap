import { parseCONumber, toISODate, collapseRepeats, monthFromName } from './utils.js';

/**
 * Bancolombia · Tarjeta de crédito (Amex, Visa, Mastercard)
 * El extracto trae una sección en pesos y otra en dólares. Dentro de cada una
 * están los movimientos nuevos y las compras de meses anteriores que se siguen pagando a cuotas.
 */
export const bancolombiaTarjeta = {
  id: 'bancolombia-tarjeta',
  bank: 'Bancolombia',
  product: 'Tarjeta de crédito',

  detect(lines) {
    const t = lines.slice(0, 60).map(l => collapseRepeats(l.text)).join('\n');
    return /bancolombia/i.test(lines.map(l => l.text).join('\n')) && /Tarjeta:\s*\*+\d{4}/.test(t) && /Periodo facturado/i.test(t);
  },

  parse(lines) {
    const clean = lines.map(l => ({ ...l, text: collapseRepeats(l.text).trim() }));
    const all = clean.map(l => l.text).join('\n');
    const card = all.match(/Tarjeta:\s*\*+(\d{4})/);
    const period = all.match(/(\d{1,2})\s+([a-z]{3})\.?\s*-\s*(\d{1,2})\s+([a-z]{3})\.?\s*(\d{4})/i);
    const due = all.match(/([a-z]{3})\.\s*(\d{1,2}),\s*(\d{4})/i);

    let year = period ? Number(period[5]) : null;
    let periodStart = null, periodEnd = null;
    if (period) {
      const m1 = monthFromName(period[2]), m2 = monthFromName(period[4]);
      periodEnd = toISODate(period[3], m2, year);
      periodStart = toISODate(period[1], m1, m1 > m2 ? year - 1 : year);
    }

    // Totales del resumen en pesos, para comprobar que no faltó ningún movimiento
    const firstSummary = all.split(/Moneda:\s*DOLARES/i)[0];
    const summaryPurchases = firstSummary.match(/Compras del mes\s+\$\s*([\d.,]+)/);
    const summaryLateFee = firstSummary.match(/Intereses de mora\s+\$\s*([\d.,]+)/);
    const summaryOther = firstSummary.match(/Otros cargos\s+\$\s*([\d.,]+)/);

    const transactions = [];
    let currency = 'COP';
    let previous = false;
    const rx = /^(?:(\d{6})\s+)?(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s{2,}\$\s*(-?[\d.,]+)(.*)$/;

    for (let i = 0; i < clean.length; i++) {
      const text = clean[i].text;
      const cur = text.match(/(?:ESTADO DE CUENTA EN|Moneda):\s*(PESOS|DOLARES)/i);
      if (cur) { currency = /DOLAR/i.test(cur[1]) ? 'USD' : 'COP'; previous = false; }
      if (/Nuevos movimientos/i.test(text)) previous = false;
      if (/Movimientos antes de/i.test(text)) previous = true;

      const m = text.match(rx);
      if (!m) continue;
      const [, , d, mo, y, desc, valueStr, rest] = m;
      const value = parseCONumber(valueStr);
      if (value == null) continue;
      const inst = rest.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      const rates = [...rest.matchAll(/([\d,]+)\s*%/g)].map(r => parseCONumber(r[1]));
      const pending = rest.match(/\$\s*([\d.,]+)\s*$/);
      const original = clean[i + 1]?.text.match(/VR MONEDA ORIG\s+([\d.]+)/);

      transactions.push({
        date: toISODate(d, mo, y),
        description: desc.trim(),
        amount: -value, // negativo = cargo; los abonos vienen con signo menos y quedan positivos
        currency,
        card: card ? card[1] : null,
        installments: inst ? { current: Number(inst[1]), total: Number(inst[2]) } : null,
        rate: rates[1] || rates[0] || null,
        pendingBalance: pending ? parseCONumber(pending[1]) : null,
        previousPeriod: previous,
        page: clean[i].page,
        line: original ? `${text}  (${clean[i + 1].text})` : text,
      });
    }

    const newCopPurchases = transactions
      .filter(t => t.currency === 'COP' && !t.previousPeriod && t.amount < 0 && !/INTERESES|CUOTA DE MANEJO/i.test(t.description))
      .reduce((s, t) => s - t.amount, 0);
    const expected = summaryPurchases ? parseCONumber(summaryPurchases[1]) : null;
    const ok = expected != null && Math.abs(expected - newCopPurchases) < 2;

    return {
      accountLast4: card ? card[1] : null,
      periodStart,
      periodEnd,
      dueDate: due ? toISODate(due[2], monthFromName(due[1]), due[3]) : null,
      transactions,
      check: {
        ok,
        label: ok
          ? 'La suma de tus compras coincide con el total "Compras del mes" del extracto.'
          : expected != null
            ? `Las compras que leí (${Math.round(newCopPurchases).toLocaleString('es-CO')}) no coinciden con el total del extracto (${Math.round(expected).toLocaleString('es-CO')}). Revisa este documento.`
            : 'No encontré el total de compras del extracto para comprobar.',
      },
      facts: {
        lateInterest: summaryLateFee ? parseCONumber(summaryLateFee[1]) : null,
        otherCharges: summaryOther ? parseCONumber(summaryOther[1]) : null,
      },
    };
  },
};
