import { bbvaCuenta } from './bbva-cuenta.js';
import { bbvaTarjeta } from './bbva-tarjeta.js';
import { bancolombiaTarjeta } from './bancolombia-tarjeta.js';
import { bancolombiaCuenta, nuCuenta, bbvaCredito } from './otros.js';
import { occidenteCuenta } from './occidente.js';
import { periodLabel } from './utils.js';
import { classify } from '../engine/classify.js';
import { normalizeMerchant } from '../engine/merchant.js';

export const PARSERS = [bbvaTarjeta, bbvaCuenta, bbvaCredito, bancolombiaTarjeta, bancolombiaCuenta, occidenteCuenta, nuCuenta];
export const SUPPORTED_BANKS = 'BBVA (cuenta, tarjeta y créditos), Bancolombia (cuenta y tarjeta), Banco de Occidente (cuenta) y Nu (cuenta)';

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
    // Si el lector propio no cuadra los totales (por ejemplo, el banco cambió el formato),
    // se intenta con la IA y gana la lectura que sí cuadre.
    if (result.check && !result.check.ok && !result.unsupportedMovements && llm) {
      try {
        const ai = await llm(lines);
        // También gana la IA si el lector propio no encontró nada y ella sí
        if (ai.isStatement !== false && (ai.check?.ok || (!result.transactions.length && ai.transactions.length))) {
          result = { ...result, ...ai, accountLast4: result.accountLast4 || ai.accountLast4 };
          method = 'ai';
        }
      } catch { /* sin IA: se queda la lectura propia, marcada como no cuadrada */ }
    }
  } else if (llm) {
    try {
      result = await llm(lines);
    } catch (e) {
      if (e.code === 'AI_NOT_CONFIGURED') {
        return { ok: false, reason: 'unsupported', message: `Todavía no sé leer este tipo de extracto y la lectura con IA no está activada. Por ahora leo ${SUPPORTED_BANKS}.` };
      }
      throw e;
    }
    // La IA leyó el PDF pero no es un extracto, o no hay nada que se pueda comprobar: no se guarda nada
    if (result.isStatement === false) {
      return { ok: false, reason: 'not_statement', message: 'Este PDF no parece un extracto bancario. Sube el extracto o estado de cuenta que te manda el banco.' };
    }
    if (result.empty) {
      return { ok: false, reason: 'unreadable', message: 'Abrí el PDF, pero no pude leer movimientos que se puedan comprobar. No guardé nada para no mostrarte datos dudosos. Intenta de nuevo o avísanos de qué banco es.' };
    }
    parserId = 'ia'; bank = result.bank || 'Banco sin identificar'; product = result.product || 'Extracto'; method = 'ai';
  } else {
    return {
      ok: false,
      reason: 'unsupported',
      message: `Todavía no sé leer este tipo de extracto. Por ahora leo ${SUPPORTED_BANKS}.`,
    };
  }

  const period = (result.periodEnd || result.periodStart || '').slice(0, 7) || null;
  const docKey = `${parserId === 'ia' ? 'ia-' + bank : parserId}|${result.accountLast4 || ''}|${result.periodEnd || result.periodStart || filename}`;
  const docId = hash(docKey);
  const name = [bank, product + (result.accountLast4 ? ` *${result.accountLast4}` : ''), periodLabel(period)].join(' · ');

  const transactions = result.transactions.map((t, i) => {
    const c = classify(t);
    const m = normalizeMerchant(t.description);
    return {
      ...c,
      merchant: m.name,
      merchantKey: m.key,
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
