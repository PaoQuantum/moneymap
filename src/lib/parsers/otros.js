import { parseUSNumber, toISODate } from './utils.js';

/**
 * Bancolombia · Cuenta de ahorros
 * Movimientos con fecha d/mm; el año sale del periodo DESDE/HASTA.
 */
export const bancolombiaCuenta = {
  id: 'bancolombia-cuenta',
  bank: 'Bancolombia',
  product: 'Cuenta de ahorros',

  detect(lines) {
    const t = lines.map(l => l.text).join('\n');
    return /bancolombia/i.test(t) && /CUENTA DE AHORROS/i.test(t) && /DESDE:\s*\d{4}\/\d{2}\/\d{2}/.test(t);
  },

  parse(lines) {
    const t = lines.map(l => l.text).join('\n');
    const range = t.match(/DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})\s+HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/);
    const account = t.match(/N[ÚU]MERO\s+(\d+)/);
    const startY = range ? Number(range[1]) : null;
    const startM = range ? Number(range[2]) : null;
    const transactions = [];
    for (const line of lines) {
      const m = line.text.trim().match(/^(\d{1,2})\/(\d{2})\s+(.+?)\s{2,}.*?(-?[\d,]+\.\d{2})\s+(-?[\d,]*\.\d{2})$/);
      if (!m) continue;
      const [, d, mo, desc, value] = m;
      const year = startY && Number(mo) < startM ? startY + 1 : startY;
      transactions.push({
        date: year ? toISODate(d, mo, year) : null,
        description: desc.replace(/\s{2,}.*/, '').trim(),
        amount: parseUSNumber(value),
        currency: 'COP',
        page: line.page,
        line: line.text.trim(),
      });
    }
    return {
      accountLast4: account ? account[1].slice(-4) : null,
      periodStart: range ? toISODate(range[3], range[2], range[1]) : null,
      periodEnd: range ? toISODate(range[6], range[5], range[4]) : null,
      transactions,
      check: { ok: true, label: `Leí ${transactions.length} movimiento(s).` },
      facts: {},
    };
  },
};

/**
 * Nu · Cuenta
 * Por ahora solo se reconoce el extracto y si tuvo movimientos o no.
 */
export const nuCuenta = {
  id: 'nu-cuenta',
  bank: 'Nu',
  product: 'Cuenta Nu',

  detect(lines) {
    return /Nu Colombia Compa/i.test(lines.map(l => l.text).join('\n'));
  },

  parse(lines) {
    const t = lines.map(l => l.text).join('\n');
    const period = t.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/);
    const months = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };
    const account = t.match(/\b(\d{8})\b/);
    const empty = /No hiciste movimientos/i.test(t);
    const m = period ? months[period[3]] : null;
    return {
      accountLast4: account ? account[1].slice(-4) : null,
      periodStart: m ? toISODate(period[1], m, period[4]) : null,
      periodEnd: m ? toISODate(period[2], m, period[4]) : null,
      transactions: [],
      unsupportedMovements: !empty,
      check: {
        ok: empty,
        label: empty
          ? 'Este mes no tuviste movimientos en tu cuenta Nu.'
          : 'Todavía no sé leer los movimientos de Nu. Los puedes revisar en tu app.',
      },
      facts: {},
    };
  },
};

/**
 * BBVA · Créditos (hipotecario, consumo, libre inversión)
 * Los rótulos de estos extractos vienen como imagen, así que solo se toma
 * lo que se puede leer sin adivinar: tipo de crédito, número, periodo y cuota.
 */
export const bbvaCredito = {
  id: 'bbva-credito',
  bank: 'BBVA',
  product: 'Crédito',

  detect(lines) {
    const t = lines.map(l => l.text).join('\n');
    return /Ley 2300/i.test(t) && /(HIPOTECARIO|CREDITO DE CONSUMO|LIBRE INVERSI|LEASING|VEHICULO)/i.test(t) && /\d{2}[-/]\d{2}[-/]\d{4}\s+AL\s+\d{2}[-/]\d{2}[-/]\d{4}/.test(t);
  },

  parse(lines) {
    const t = lines.map(l => l.text).join('\n');
    const kind = /HIPOTECARIO/i.test(t) ? 'Crédito hipotecario'
      : /CREDITO DE CONSUMO/i.test(t) ? 'Crédito de consumo'
      : /LIBRE INVERSI/i.test(t) ? 'Crédito de libre inversión'
      : /LEASING/i.test(t) ? 'Leasing' : 'Crédito de vehículo';
    const obligation = t.match(/\b0013\s+\d{4}\s+\d{2}\s+(\d{10})\b/);
    const period = t.match(/(\d{2})[-/](\d{2})[-/](\d{4})\s+AL\s+(\d{2})[-/](\d{2})[-/](\d{4})/);
    const cuota = t.match(/\b(\d{1,3})\s+DE\s+(\d{2,3})\b/);
    return {
      product: kind,
      accountLast4: obligation ? obligation[1].slice(-4) : null,
      periodStart: period ? toISODate(period[1], period[2], period[3]) : null,
      periodEnd: period ? toISODate(period[4], period[5], period[6]) : null,
      transactions: [],
      unsupportedMovements: false,
      check: {
        ok: true,
        label: `Extracto de ${kind.toLowerCase()}${cuota ? `, cuota ${cuota[1]} de ${cuota[2]}` : ''}. Lo guardo ordenado; el pago de la cuota ya aparece en el extracto de tu cuenta.`,
      },
      facts: cuota ? { installment: { current: Number(cuota[1]), total: Number(cuota[2]) } } : {},
    };
  },
};
