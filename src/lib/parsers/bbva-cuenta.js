import { parseUSNumber, toISODate } from './utils.js';

/**
 * BBVA · Cuenta de ahorros (Libretón)
 * Cada movimiento trae el saldo después del movimiento, así que el signo
 * (entra o sale plata) se calcula con el saldo y no se adivina.
 */
export const bbvaCuenta = {
  id: 'bbva-cuenta',
  bank: 'BBVA',
  product: 'Cuenta de ahorros',

  detect(lines) {
    const t = lines.map(l => l.text).join('\n');
    return /SALDO CIERRE MES ANTERIOR/.test(t) && /CUENTA DE AHORROS/i.test(t);
  },

  parse(lines) {
    const text = lines.map(l => l.text).join('\n');
    const period = text.match(/PER[IÍ]ODO DESDE:\s*(\d{2})-(\d{2})-(\d{4})\s*HASTA:\s*(\d{2})-(\d{2})-(\d{4})/i);
    const opening = text.match(/SALDO CIERRE MES ANTERIOR\s+([\d,]+\.\d{2})/);
    const closing = text.match(/SALDO FINAL\s+([\d,]+\.\d{2})/);
    const account = text.match(/N[ÚU]MERO DE CUENTA:\s*(\d+)/i) || text.match(/\b(\d{18})\b/);

    const openingBalance = opening ? parseUSNumber(opening[1]) : null;
    let balance = openingBalance;
    const transactions = [];
    const rx = /^(?:\d+\s+)?(\d{2})-(\d{2})-(\d{4})\s+\d{2}-\d{2}-\d{4}\s+(.+?)\s{2,}([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

    for (const line of lines) {
      const m = line.text.trim().match(rx);
      if (!m) continue;
      const [, d, mo, y, desc, amountStr, balStr] = m;
      const amount = parseUSNumber(amountStr);
      const newBalance = parseUSNumber(balStr);
      let sign = null;
      if (balance != null) {
        if (Math.abs(balance + amount - newBalance) < 0.05) sign = 1;
        else if (Math.abs(balance - amount - newBalance) < 0.05) sign = -1;
      }
      transactions.push({
        date: toISODate(d, mo, y),
        description: desc.trim(),
        amount: sign == null ? -amount : sign * amount,
        currency: 'COP',
        page: line.page,
        line: line.text.trim(),
        needsReview: sign == null,
        reviewReason: sign == null ? 'No pude confirmar si este movimiento entró o salió de la cuenta.' : null,
      });
      balance = newBalance;
    }

    const closingBalance = closing ? parseUSNumber(closing[1]) : null;
    const sum = transactions.reduce((s, t) => s + t.amount, 0);
    const reconciled = openingBalance != null && closingBalance != null
      && Math.abs(openingBalance + sum - closingBalance) < 1;

    return {
      accountLast4: account ? account[1].slice(-4) : null,
      periodStart: period ? toISODate(period[1], period[2], period[3]) : null,
      periodEnd: period ? toISODate(period[4], period[5], period[6]) : null,
      transactions,
      check: {
        ok: reconciled,
        label: reconciled
          ? 'El saldo inicial más los movimientos da exactamente el saldo final del extracto.'
          : 'Los movimientos no cuadran con el saldo final del extracto. Revisa este documento.',
      },
      facts: { openingBalance, closingBalance },
    };
  },
};
