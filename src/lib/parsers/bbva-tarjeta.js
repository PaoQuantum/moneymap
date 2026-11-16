import { parseUSNumber, toISODate } from './utils.js';

/**
 * BBVA · Tarjeta de crédito
 * Formato de cada movimiento: ddmmaaaa  autorización  descripción  [tasa]  [NN DE NN]  valor ...
 * Un mismo extracto puede traer varias tarjetas (titular y amparadas).
 */
export const bbvaTarjeta = {
  id: 'bbva-tarjeta',
  bank: 'BBVA',
  product: 'Tarjeta de crédito',

  detect(lines) {
    const t = lines.map(l => l.text).join('\n');
    return /MOVIMIENTOS DE ESTE MES/.test(t) && /TARJETA\s+\d{6}\*{6}\d{4}/.test(t);
  },

  parse(lines) {
    const transactions = [];
    const cards = [];
    let currentCard = null;
    const headerDates = [];
    let rates = [];
    let inMovements = false;

    for (const line of lines) {
      const text = line.text.trim();
      const card = text.match(/TARJETA\s+\d{6}\*{6}(\d{4})/);
      if (card) {
        currentCard = card[1];
        if (!cards.includes(currentCard)) cards.push(currentCard);
        inMovements = true;
        continue;
      }
      if (!inMovements) {
        for (const d of text.matchAll(/\b(\d{2})-(\d{2})-(\d{4})\b/g)) headerDates.push(toISODate(d[1], d[2], d[3]));
        const r = text.match(/(\d{1,2}\.\d{2})%\s*E\.A\./);
        if (r) rates.push(Number(r[1]));
        continue;
      }

      const m = text.match(/^(\d{2})(\d{2})(\d{4})\s+\d{6}\s+(.+)$/);
      if (!m) continue;
      const [, d, mo, y, rest] = m;
      const parts = rest.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      const description = parts.shift();
      const tail = parts.join('   ');

      const isCredit = /^-\s|^-$|\s-\s/.test(tail) || /^-/.test(tail);
      const inst = tail.match(/(\d{2})\s+DE\s+(\d{2})/);
      let rate = null;
      let amountStr;
      if (inst) {
        const before = tail.slice(0, inst.index).match(/([\d.]+)\s*$/);
        rate = before ? Number(before[1]) : null;
        amountStr = tail.slice(inst.index + inst[0].length).match(/[\d,]+\.\d{2}/)?.[0];
      } else {
        const nums = tail.match(/[\d,]*\.\d{2}/g) || [];
        amountStr = nums[nums.length - 1];
        if (nums.length > 1) rate = Number(nums[0]);
      }
      const amount = parseUSNumber(amountStr);
      if (amount == null) continue;

      transactions.push({
        date: toISODate(d, mo, y),
        description,
        // En la tarjeta: negativo = cargo (lo debes), positivo = pago o devolución a tu favor
        amount: isCredit ? amount : -amount,
        currency: 'COP',
        card: currentCard,
        installments: inst ? { current: Number(inst[1]), total: Number(inst[2]) } : null,
        rate: rate || null,
        page: line.page,
        line: text,
      });
    }

    const validDates = headerDates.filter(Boolean).sort();
    const corte = validDates.length ? validDates[validDates.length - 2] || validDates[0] : null;
    const due = validDates.length ? validDates[validDates.length - 1] : null;

    return {
      accountLast4: cards[0] || null,
      cards,
      periodEnd: corte,
      dueDate: due !== corte ? due : null,
      transactions,
      check: {
        ok: transactions.length > 0,
        label: transactions.length > 0
          ? `Leí ${transactions.length} movimientos de ${cards.length} tarjeta(s): ${cards.map(c => '*' + c).join(', ')}.`
          : 'No encontré movimientos en este extracto.',
      },
      facts: { rateEA: rates.length ? Math.max(...rates) : null },
    };
  },
};
