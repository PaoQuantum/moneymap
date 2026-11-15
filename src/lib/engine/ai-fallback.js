import { redactLines } from './redact.js';
import { judgeExtraction } from './judge.js';

/**
 * Lector universal con IA. Se usa cuando no hay lector propio para un banco
 * o cuando el lector propio no logra cuadrar los totales.
 * Solo manda texto anonimizado, y el resultado pasa por el "juez" (judge.js).
 */
export function makeAiFallback({ names = [] } = {}) {
  return async function aiFallback(lines) {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: redactLines(lines, { names }) }),
    });
    if (res.status === 501) {
      const e = new Error('La lectura con IA no está activada.');
      e.code = 'AI_NOT_CONFIGURED';
      throw e;
    }
    if (!res.ok) throw new Error('La IA no pudo leer este extracto.');
    const ai = await res.json();
    const judged = judgeExtraction(ai, lines);
    const last4 = String(ai.accountLast4 || '').replace(/\D/g, '').slice(-4) || null;
    return {
      bank: ai.bank,
      product: ai.product,
      accountLast4: last4,
      periodStart: /^\d{4}-\d{2}-\d{2}$/.test(ai.periodStart || '') ? ai.periodStart : null,
      periodEnd: /^\d{4}-\d{2}-\d{2}$/.test(ai.periodEnd || '') ? ai.periodEnd : null,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(ai.dueDate || '') ? ai.dueDate : null,
      transactions: judged.transactions,
      check: judged.check,
    };
  };
}
