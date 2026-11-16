import { fmt, fmtDate } from './insights.js';

/**
 * Arma el reclamo de un hallazgo: tabla de cobros (con su extracto y página),
 * totales y un texto listo para copiar en el chat, correo o llamada con el banco.
 * Solo usa movimientos que están en los extractos: nada se calcula "por encima".
 */

const NEXT_STEPS = [
  'Envíalo por el chat de la app del banco, por correo o léelo en la línea de atención. Pide siempre el número de radicado.',
  'El banco tiene 15 días hábiles para responderte.',
  'Si no responde o la respuesta no te sirve, puedes acudir gratis al Defensor del Consumidor Financiero de tu banco o poner una queja ante la Superintendencia Financiera.',
];

const KINDS = {
  fees: {
    title: b => `Reclamo de cuotas de manejo · ${b}`,
    goal: 'Devolución',
    intro: b => `Buenos días. Solicito la devolución de las cuotas de manejo cobradas en mis productos ${b}, porque al ofrecerme el producto me informaron que no tendría cuota de manejo (o cumplo la condición para que me la exoneren). También solicito que no se me vuelva a cobrar.`,
  },
  insurance: {
    title: b => `Cancelar seguros no solicitados · ${b}`,
    goal: 'Cancelación y devolución',
    intro: b => `Buenos días. En mis productos ${b} aparecen cobros de seguros que no recuerdo haber solicitado. Solicito copia de la autorización firmada para cada seguro; si no existe, solicito cancelarlos y devolver lo cobrado.`,
  },
  deferred: {
    title: b => `Compras a 1 cuota por defecto · ${b}`,
    goal: 'Cambiar a 1 cuota',
    intro: b => `Buenos días. Mis compras con tarjeta ${b} están quedando diferidas a varias cuotas sin que yo lo elija. Solicito que todas mis compras queden a 1 cuota por defecto y que las compras de la lista se pasen a 1 cuota sin intereses, ya que no autoricé diferirlas.`,
  },
  late: {
    title: b => `Reversión de intereses de mora · ${b}`,
    goal: 'Reversión (por buena voluntad)',
    intro: b => `Buenos días. Siempre he pagado a tiempo mis productos con ${b}, pero se me cobraron intereses de mora por un pago que se hizo pocos días después de la fecha límite. Solicito, por esta única vez, la reversión de estos intereses.`,
    note: 'La mora sí está permitida, así que aquí pides un favor: muchas veces lo aceptan si es la primera vez.',
  },
};

export function buildClaim(finding, txById, docById) {
  const k = KINDS[finding.claim.kind];
  const bank = finding.claim.bank;
  const charged = finding.claim.charged.map(id => txById[id]).filter(Boolean);
  const refunded = (finding.claim.refunded || []).map(id => txById[id]).filter(Boolean);
  const totalCharged = charged.reduce((a, t) => a + Math.abs(t.amount), 0);
  const totalRefunded = refunded.reduce((a, t) => a + Math.abs(t.amount), 0);
  const rows = [...charged, ...refunded].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const line = t => `- ${fmtDate(t.date)} · ${t.card ? `Tarjeta *${t.card}` : 'Cuenta'} · ${t.description} · ${t.amount > 0 ? '+' : ''}${fmt(t.amount, t.currency)} (extracto ${docById[t.docId]?.name || ''}, pág. ${t.page})`;

  const text = [
    k.intro(bank),
    '',
    'Detalle según mis extractos:',
    ...rows.map(line),
    '',
    refunded.length
      ? `Total cobrado: ${fmt(totalCharged)}. Ya devuelto: ${fmt(totalRefunded)}. Pendiente: ${fmt(totalCharged - totalRefunded)}.`
      : `Total: ${fmt(totalCharged)}.`,
    'Quedo pendiente del número de radicado y de la respuesta por escrito. Gracias.',
  ].join('\n');

  return {
    title: k.title(bank),
    goal: k.goal,
    note: k.note || null,
    rows,
    totals: { charged: totalCharged, refunded: totalRefunded, pending: totalCharged - totalRefunded },
    text,
    nextSteps: NEXT_STEPS,
  };
}

export const CLAIM_STATUS = {
  todo: 'Por reclamar',
  sent: 'Reclamo enviado',
  won: 'Me devolvieron',
  lost: 'No aceptaron',
};
