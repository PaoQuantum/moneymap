import { redactLines } from './redact.js';
import { judgeExtraction } from './judge.js';

// Si la IA no reconoce el banco (a veces el nombre solo está en el logo), se busca en el texto
const KNOWN_BANKS = [
  [/BANCO DE OCCIDENTE/i, 'Banco de Occidente'], [/BANCOLOMBIA/i, 'Bancolombia'], [/\bBBVA\b/i, 'BBVA'],
  [/DAVIVIENDA/i, 'Davivienda'], [/BANCO DE BOGOT[AÁ]/i, 'Banco de Bogotá'], [/BANCO POPULAR/i, 'Banco Popular'],
  [/AV ?VILLAS/i, 'AV Villas'], [/SCOTIABANK|COLPATRIA/i, 'Scotiabank Colpatria'], [/BANCO CAJA SOCIAL/i, 'Banco Caja Social'],
  [/ITA[UÚ]/i, 'Itaú'], [/FALABELLA/i, 'Banco Falabella'], [/\bNU\b.*(COLOMBIA|FINANCIERA)|NU COLOMBIA/i, 'Nu'],
  [/NEQUI/i, 'Nequi'], [/DAVIPLATA/i, 'Daviplata'], [/LULO ?BANK/i, 'Lulo Bank'], [/RAPPIPAY|RAPPICARD/i, 'RappiPay'],
  [/PICHINCHA/i, 'Banco Pichincha'], [/BANCO AGRARIO/i, 'Banco Agrario'], [/SERFINANZA/i, 'Serfinanza'], [/TUYA\b/i, 'Tuya'],
  [/GNB SUDAMERIS/i, 'GNB Sudameris'], [/BANCOOMEVA|COOMEVA/i, 'Bancoomeva'], [/FINANDINA/i, 'Banco Finandina'],
];

const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

/**
 * Lector universal con IA. Se usa cuando no hay lector propio para un banco
 * o cuando el lector propio no logra cuadrar los totales.
 * Solo manda texto anonimizado, y el resultado pasa por el "juez" (judge.js).
 */
export function makeAiFallback({ names = [] } = {}) {
  return async function aiFallback(lines) {
    if (!lines.length || lines.map(l => l.text).join('').replace(/\s/g, '').length < 40) {
      const e = new Error('Este PDF no tiene texto que se pueda leer: parece una foto o un escaneo. Descarga el extracto original desde la app o el correo del banco.');
      e.code = 'NO_TEXT';
      throw e;
    }
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
    if (!res.ok) {
      let message = null;
      try { message = (await res.json()).message; } catch { /* sin detalle */ }
      throw new Error(message || 'La IA no pudo leer este extracto. Intenta de nuevo.');
    }
    const ai = await res.json();
    const judged = judgeExtraction(ai, lines);
    const text = lines.map(l => l.text).join('\n');
    const known = KNOWN_BANKS.find(([re]) => re.test(text));
    const last4 = String(ai.accountLast4 || '').replace(/\D/g, '').slice(-4) || null;
    // Sin periodo explícito: se usa la fecha del último movimiento comprobado
    const dates = judged.transactions.map(t => t.date).filter(Boolean).sort();
    return {
      isStatement: ai.isBankStatement !== false,
      empty: !judged.transactions.length && !judged.emptyMonth,
      bank: (known && known[1]) || ai.bank || null,
      product: ai.product || null,
      accountLast4: last4,
      periodStart: isDate(ai.periodStart) ? ai.periodStart : dates[0] || null,
      periodEnd: isDate(ai.periodEnd) ? ai.periodEnd : dates[dates.length - 1] || null,
      dueDate: isDate(ai.dueDate) ? ai.dueDate : null,
      transactions: judged.transactions,
      check: ai.truncated
        ? { ok: false, label: 'El extracto es muy largo y solo se leyó una parte. Revisa que no falten movimientos.' }
        : judged.check,
    };
  };
}
