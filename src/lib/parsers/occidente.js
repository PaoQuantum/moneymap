import { parseUSNumber, toISODate } from './utils.js';

/**
 * Banco de Occidente · Cuenta de ahorros / corriente ("Extracto Digital")
 *
 * Cada fila trae: DÍA · TRANSACCIÓN · (IDENT.) · DÉBITOS · CRÉDITOS · SALDO
 * El día viene sin mes ni año: se toman de la FECHA DE CORTE.
 * Se comprueba dos veces: saldo anterior + créditos − débitos = saldo actual,
 * y que los totales de créditos y débitos del resumen coincidan con las filas.
 */
const NUM = '(-?[\\d,]+\\.\\d{2})';
const ROW = new RegExp(`^(\\d{2})\\s+(.+?)\\s+(?:(\\d{4,})\\s+)?${NUM}\\s+${NUM}\\s+${NUM}$`);

export const occidenteCuenta = {
  id: 'occidente-cuenta',
  bank: 'Banco de Occidente',
  product: 'Cuenta de ahorros',

  detect(lines) {
    const t = lines.map(l => l.text).join('\n');
    return /SALDO ANTERIOR/i.test(t) && /FECHA DE CORTE/i.test(t) && /CUENTA\s+(DE\s+)?(AHORROS|CORRIENTE)/i.test(t)
      && (/OCCIDENTE/i.test(t) || /890\.?300\.?279/.test(t));
  },

  parse(lines) {
    const text = lines.map(l => l.text).join('\n');
    const corte = text.match(/FECHA DE CORTE:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    const account = text.match(/CUENTA\s+No\.?\s*([\d-]+)/i);
    const opening = text.match(new RegExp(`SALDO ANTERIOR\\s+${NUM}`, 'i'));
    const closing = text.match(new RegExp(`SALDO ACTUAL\\s+${NUM}`, 'i'));
    const totCredits = text.match(new RegExp(`CR[EÉ]DITOS\\s+${NUM}`, 'i'));
    const totDebits = text.match(new RegExp(`D[EÉ]BITOS\\s+${NUM}`, 'i'));

    const cDay = corte ? Number(corte[1]) : 31;
    const cMonth = corte ? Number(corte[2]) : null;
    const cYear = corte ? Number(corte[3]) : null;
    const dateFor = (day) => {
      if (!cMonth) return null;
      // Un día mayor al del corte pertenece al mes anterior
      let m = cMonth, y = cYear;
      if (Number(day) > cDay) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
      return toISODate(day, m, y);
    };

    const transactions = [];
    for (const line of lines) {
      const m = line.text.trim().match(ROW);
      if (!m) continue;
      const [, day, desc, , debitStr, creditStr] = m;
      const debit = parseUSNumber(debitStr) || 0;
      const credit = parseUSNumber(creditStr) || 0;
      const amount = credit - debit;
      if (!amount) continue;
      transactions.push({
        date: dateFor(day),
        description: desc.trim(),
        amount,
        currency: 'COP',
        page: line.page,
        line: line.text.trim(),
      });
    }

    const openingBalance = opening ? parseUSNumber(opening[1]) : null;
    const closingBalance = closing ? parseUSNumber(closing[1]) : null;
    const sum = transactions.reduce((s, t) => s + t.amount, 0);
    const credits = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const debits = transactions.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0);
    const near = (a, b) => Math.abs(a - b) < 0.015;
    const balanceOk = openingBalance != null && closingBalance != null && near(openingBalance + sum, closingBalance);
    const totalsOk = (!totCredits || near(parseUSNumber(totCredits[1]), credits)) && (!totDebits || near(parseUSNumber(totDebits[1]), debits));
    const ok = balanceOk && totalsOk;

    return {
      product: /CUENTA\s+(DE\s+)?CORRIENTE/i.test(text) ? 'Cuenta corriente' : 'Cuenta de ahorros',
      accountLast4: account ? account[1].replace(/\D/g, '').slice(-4) : null,
      periodStart: cMonth ? toISODate(1, cMonth, cYear) : null,
      periodEnd: corte ? toISODate(corte[1], corte[2], corte[3]) : null,
      transactions,
      check: {
        ok,
        label: ok
          ? 'El saldo anterior más los créditos menos los débitos da exactamente el saldo actual del extracto.'
          : openingBalance == null || closingBalance == null
            ? 'No encontré el saldo anterior o el saldo actual para comprobar los movimientos.'
            : 'Los movimientos no cuadran con el resumen del extracto. Revisa este documento.',
      },
      facts: { openingBalance, closingBalance },
    };
  },
};
