import { redactLines, verifyAgainstLine } from './redact.js';

/**
 * Crea la función de respaldo con IA que usa processLines cuando no hay lector para un banco.
 * Solo manda texto anonimizado y solo acepta movimientos que se puedan comprobar en el PDF.
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
    const json = await res.json();
    const accepted = [];
    let rejected = 0;
    for (const t of json.transactions || []) {
      const line = lines[t.line];
      if (verifyAgainstLine(t, line)) {
        accepted.push({
          date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null,
          description: String(t.description || '').slice(0, 120),
          amount: Number(t.amount),
          currency: t.currency === 'USD' ? 'USD' : 'COP',
          page: line.page,
          line: line.text,
          needsReview: true,
          reviewReason: 'Leído con IA: comprueba que esté bien.',
        });
      } else {
        rejected++;
      }
    }
    return {
      bank: json.bank,
      product: json.product,
      periodStart: json.periodStart || null,
      periodEnd: json.periodEnd || null,
      transactions: accepted,
      check: {
        ok: rejected === 0 && accepted.length > 0,
        label: rejected
          ? `Leído con IA. Descarté ${rejected} movimiento(s) que no pude encontrar escritos en el PDF.`
          : 'Leído con IA. Cada movimiento se comprobó contra la línea del PDF de donde salió.',
      },
    };
  };
}
