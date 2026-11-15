import { bbvaCuenta } from './bbva-cuenta.js';
import { bbvaTarjeta } from './bbva-tarjeta.js';
import { bancolombiaTarjeta } from './bancolombia-tarjeta.js';
import { bancolombiaCuenta, nuCuenta, bbvaCredito } from './otros.js';
import { periodLabel } from './utils.js';
import { classify } from '../engine/classify.js';

export const PARSERS = [bbvaTarjeta, bbvaCuenta, bbvaCredito, bancolombiaTarjeta, bancolombiaCuenta, nuCuenta];
export const SUPPORTED_BANKS = 'BBVA (cuenta, tarjeta y créditos), Bancolombia (cuenta y tarjeta) y Nu (cuenta)';

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Convierte las líneas de un PDF en un documento con sus movimientos.
 * Si ningún lector conoce el formato y hay una función `llm`, la usa como respaldo;
 * cada movimiento que devuelva la IA debe aparecer textualmente en el PDF o se descarta.
 */
export async function processLines({ lines, pages, filename, origin, llm }) {
  const parser = PARSERS.find(p => p.detect(lines));
  let result, parserId, bank, product, method;

  if (parser) {
    result = parser.parse(lines);
    parserId = parser.id; bank = parser.bank; product = result.product || parser.product; method = 'reader';
  } else if (llm) {
    result = await llm(lines);
    parserId = 'ia'; bank = result.bank || 'Banco sin identificar'; product = result.product || 'Extracto'; method = 'ai';
  } else {
    return {
      ok: false,
      reason: 'unsupported',
      message: `Todavía no sé leer este tipo de extracto. Por ahora leo ${SUPPORTED_BANKS}.`,
    };
  }

  const period = (result.periodEnd || result.periodStart || '').slice(0, 7) || null;
  const docKey = `${parserId}|${result.accountLast4 || ''}|${result.periodEnd || result.periodStart || filename}`;
  const docId = hash(docKey);
  const name = [bank, product + (result.accountLast4 ? ` *${result.accountLast4}` : ''), periodLabel(period)].join(' · ');

  const transactions = result.transactions.map((t, i) => {
    const c = classify(t);
    return {
      ...c,
      id: hash(`${docId}|${i}|${t.date}|${t.amount}|${t.description}`),
      docId,
      // Si la fecha no se pudo leer, NO se inventa: queda vacía y marcada para revisar
      needsReview: t.needsReview || !t.date,
      reviewReason: t.reviewReason || (!t.date ? 'No pude leer la fecha de este movimiento.' : null),
    };
  });

  return {
    ok: true,
    doc: {
      id: docId,
      name,
      bank,
      product,
      parserId,
      method,
      accountLast4: result.accountLast4 || null,
      cards: result.cards || null,
      period,
      periodStart: result.periodStart || null,
      periodEnd: result.periodEnd || null,
      dueDate: result.dueDate || null,
      filename,
      origin: origin || { type: 'upload' },
      pages,
      check: result.check,
      facts: result.facts || {},
      unsupportedMovements: !!result.unsupportedMovements,
      importedAt: new Date().toISOString(),
      txCount: transactions.length,
    },
    transactions,
  };
}
