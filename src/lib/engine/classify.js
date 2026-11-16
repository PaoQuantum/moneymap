/**
 * Clasifica cada movimiento en un TIPO (para no contar dos veces la plata)
 * y en una CATEGORÍA de gasto (para entender en qué se va).
 *
 * Tipos:
 *  income         Ingreso (nómina, cesantías, otros)
 *  expense        Gasto / compra
 *  fee            Cuota de manejo y comisiones
 *  interest       Intereses (corrientes o de mora)
 *  insurance      Seguros cobrados en la tarjeta o la cuenta
 *  loan_payment   Cuota de un crédito
 *  card_payment   Pago a una tarjeta o a un banco (no es gasto nuevo: el gasto ya está en la tarjeta)
 *  cash_advance   Avance de la tarjeta (es deuda, no ingreso)
 *  investment     Plata que pasaste a una inversión (no es gasto)
 *  transfer_own   Movimientos entre tus propias cuentas
 *  transfer_out   Envíos a otras personas
 *  refund         Devoluciones a tu favor
 */

const KIND_RULES = [
  [/INTERESES\s+(DE\s+)?MORA/i, 'interest', 'Intereses de mora'],
  [/INTERESES\s+CORRIENTES/i, 'interest', 'Intereses corrientes'],
  [/ABONO POR INTERESES|INTERESES RECIBIDOS/i, 'income', 'Rendimientos'],
  [/CUOTA DE MANEJO/i, 'fee', 'Cuota de manejo'],
  [/DEVOL|REVERSO/i, 'refund', 'Devolución'],
  [/PRIM(A)?\s*SEG|SEGURO/i, 'insurance', 'Seguros'],
  [/AVANCE A CTA|AVANCE TARJETA|^AVANCE/i, 'cash_advance', 'Avance de tarjeta'],
  [/PAGO (DE )?TARJETA|PAGO TARJETA DE CRED|ABONO WOMPI|PAGO AUTOM TC|ABONO SUCURSAL VIRTUAL/i, 'card_payment', 'Pago de tarjeta'],
  [/PSE A (BANCOLOMBIA|BANCO DE OCCIDE|BANCO DE BOGOTA|DAVIVIENDA|SCOTIABANK|BANCO POPULAR|ITAU)/i, 'card_payment', 'Pago a un banco'],
  [/CUOTA DE CREDITO|PAGO CREDITO|CUOTA PRESTAMO/i, 'loan_payment', 'Cuota de crédito'],
  [/NOMINA/i, 'income', 'Salario'],
  [/CESANTIAS/i, 'income', 'Cesantías'],
  [/ETORO|PEXTO|KUCOIN|BINANCE|TRII|FIDUCIA|CDT/i, 'investment', 'Inversión'],
  [/BRE-B PROPIO|PSE A NEQUI|RECARGA NEQUI|ABONO DOMI\.\s*0{3,}\d+/i, 'transfer_own', 'Entre tus cuentas'],
  [/ENVIO POR BRE-B|TRANSFERENCIA A |TRANSFERENCIA BBVA A/i, 'transfer_out', 'Envíos a personas'],
];

const CATEGORY_RULES = [
  [/MERCAR|SURTIFAMILIAR|MERCAMIO|EXITO|ÉXITO|CARULLA|OLIMPICA|OLÍMPICA|JUMBO|D1\b|\bARA\b|ISIMO|MADURAZO|MOLINO|PANADERIA|RAPIMERQUE|TURBO|FRUVER|SUPERMERCADO|LA 14|COMFANDI/i, 'Mercado'],
  [/RAPPI|IFOOD|DIDI FOOD|DOMICILIO/i, 'Domicilios'],
  [/UBER(?! EATS)|DIDI|INDRIVE|CABIFY|TAXI|PICAP|MIO\b|PEAJE|PARQUEADERO/i, 'Transporte'],
  [/TEXACO|TERPEL|PRIMAX|BIOMAX|SHELL|MOBIL|ESTACION/i, 'Gasolina'],
  [/FARMATODO|CRUZ VERDE|DROGUERIA|LOCATEL|PASTEUR|MEDICINA PREPAGADA|CLINICA|LABORATORIO|SALUD/i, 'Salud'],
  [/BODYTECH|SMART FIT|GYM|SPINNING/i, 'Deporte'],
  [/SHEIN|TEMU|EBANX|AMAZON|MERCADO ?LIBRE|MERCADO ?PAGO|ALIEXPRESS|FALABELLA\.COM/i, 'Compras en línea'],
  [/NETFLIX|SPOTIFY|DISNEY|HBO|MAX\b|PRIME VIDEO|YOUTUBE|APPLE\.COM|ICLOUD|GOOGLE|OPENAI|CHATGPT|CLAUDE|ANTHROPIC|ADOBE|CANVA/i, 'Suscripciones'],
  [/DEBITO AUTOMATICO/i, 'Débitos automáticos'],
  [/GASES|EMCALI|EPM|ENEL|CLARO|MOVISTAR|TIGO|ETB|REDES|INTERNET|ACUEDUCTO/i, 'Servicios del hogar'],
  [/CONJ|ADMINISTRACION|GOU PAYMENTS|PROPIEDAD HORIZONTAL/i, 'Administración'],
  [/HOMECENTER|SODIMAC|EASY|IKEA|CORTINEROS|AGROCENTRO|FERRETERIA|DOLLARCITY|MINISO/i, 'Hogar'],
  [/CINEMARK|CINE COLOMBIA|PROCINAL|TEATRO|BOLETA/i, 'Entretenimiento'],
  [/CREPES|STARBUCKS|JUAN VALDEZ|SUBWAY|BURICA|ALBANIA|PRALINE|PROTEANDCO|BOLD|RESTAURANTE|PIZZA|FORNO|BRASAS|STORIA|HELAD|CAFE|CAFÉ/i, 'Restaurantes y salidas'],
  [/ETORO|PEXTO|KUCOIN|BINANCE|TRII|ACCIONES/i, 'Inversión'],
  [/IMPUESTO|DIAN|4X1000|GMF/i, 'Impuestos'],
];

export function classify(tx) {
  const d = tx.description || '';
  let kind = null, label = null;
  for (const [re, k, l] of KIND_RULES) {
    if (re.test(d)) { kind = k; label = l; break; }
  }
  // Un avance que LLEGA a la cuenta es plata que viene de tu tarjeta (deuda), no un ingreso
  if (kind === 'cash_advance' && tx.amount > 0) label = 'Avance que llegó de tu tarjeta';
  // El cargo pequeño a 1 cuota que acompaña un avance es la comisión del avance
  if (kind === 'cash_advance' && tx.amount < 0 && tx.installments?.total === 1) { kind = 'fee'; label = 'Comisión por avance'; }
  // En la tarjeta, una devolución o pago tiene signo positivo; si no hay regla, decide el signo
  if (!kind) {
    if (tx.amount > 0) { kind = /ABONO|RECIBISTE|TRANSFERENCIA DE/i.test(d) ? 'income' : 'refund'; label = kind === 'income' ? 'Otros ingresos' : 'Abono'; }
    else { kind = 'expense'; label = null; }
  }

  let category = label;
  if (kind === 'expense' || kind === 'fee' || kind === 'insurance') {
    const hit = CATEGORY_RULES.find(([re]) => re.test(d));
    if (kind === 'expense') category = hit ? hit[1] : 'Otros gastos';
  }
  return { ...tx, kind, category };
}

// Tipos que sí cuentan como gasto real del mes
export const SPENDING_KINDS = new Set(['expense', 'fee', 'interest', 'insurance', 'loan_payment']);

export const KIND_LABELS = {
  income: 'Ingreso',
  expense: 'Gasto',
  fee: 'Comisión',
  interest: 'Intereses',
  insurance: 'Seguro',
  loan_payment: 'Cuota de crédito',
  card_payment: 'Pago de tarjeta',
  investment: 'Inversión',
  cash_advance: 'Avance',
  transfer_own: 'Entre tus cuentas',
  transfer_out: 'Envío a otra persona',
  refund: 'Devolución',
};
