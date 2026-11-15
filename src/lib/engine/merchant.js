/**
 * Normaliza el nombre del comercio.
 *
 * Cada banco escribe el mismo comercio distinto:
 *   BBVA cuenta:   "COMPRA EN MERCAR SEDE NORTE"
 *   BBVA tarjeta:  "MERCAR SEDE NORTE"
 *   Bancolombia:   "MERCAR SEDE SUR"
 * Aquí todos quedan como { key: "MERCAR", name: "Mercar" }.
 *
 * 1. Se limpian prefijos del banco ("COMPRA EN", "PAGO POR PSE A"…).
 * 2. Si pasó por una pasarela ("BOLD SA*TIENDA", "PAYU*TIENDA") se toma la tienda real.
 * 3. Si es una marca conocida, se usa su nombre (sin sede ni ciudad).
 * 4. Si no, se quitan sufijos legales (SAS, S.A., LTDA) y se toman las 2 primeras palabras.
 */

const PREFIXES = [
  /^COMPRA (EN|POS|INTERNACIONAL|INT)\s+/, /^COMPRAS?\s+/, /^PAGO POR PSE A\s+/, /^PAGO PSE\s+/, /^PAGO CON\s+/,
  /^PAGO DE\s+/, /^PAGO\s+/, /^CARGO POR\s+/, /^CARGO CLIENTE\s+/, /^COBRO\s+/, /^NC\s+/, /^ND\s+/,
  /^RETIRO\s+/, /^ABONO DOMI\.\s*/, /^ABONO\s+/, /^TRANSFERENCIA A\s+/,
];

// Pasarelas de pago: el comercio real va después del "*"
const GATEWAYS = /^(BOLD( SA| CO)?|PAYU|MERPAGO|MERCPAGO|MERCADOPAGO|DLO|DLOCAL|PAYPAL|WOMPI|EPAYCO|SQ|PP|TPAGA|ZONA ?PAGOS)$/;

// Marcas conocidas: el resto del texto (sede, centro comercial, ciudad) se ignora
const BRANDS = [
  [/MERCAR/, 'Mercar'], [/SURTIFAMILIAR/, 'Surtifamiliar'], [/MERCAMIO/, 'Mercamío'], [/CARULLA/, 'Carulla'],
  [/\bEXITO\b/, 'Éxito'], [/OLIMPICA/, 'Olímpica'], [/\bJUMBO\b/, 'Jumbo'], [/\bD1\b/, 'D1'], [/^ARA\b|TIENDAS ARA/, 'Ara'],
  [/DOLLARCITY/, 'Dollarcity'], [/MINISO/, 'Miniso'], [/HOMECENTER|SODIMAC/, 'Homecenter'], [/\bIKEA\b/, 'IKEA'],
  [/FARMATODO/, 'Farmatodo'], [/CRUZ VERDE/, 'Cruz Verde'], [/LOCATEL/, 'Locatel'], [/DROGUERIA (LA )?REBAJA/, 'La Rebaja'],
  [/BODYTECH/, 'Bodytech'], [/SMART ?FIT/, 'Smart Fit'],
  [/RAPPI/, 'Rappi'], [/UBER ?EATS/, 'Uber Eats'], [/\bUBER\b/, 'Uber'], [/DIDI ?FOOD/, 'DiDi Food'], [/\bDIDI\b/, 'DiDi'],
  [/INDRIVE/, 'inDrive'], [/CABIFY/, 'Cabify'], [/PICAP/, 'Picap'],
  [/STARBUCKS/, 'Starbucks'], [/JUAN VALDEZ/, 'Juan Valdez'], [/CREPES/, 'Crepes & Waffles'], [/SUBWAY/, 'Subway'],
  [/NETFLIX/, 'Netflix'], [/SPOTIFY/, 'Spotify'], [/DISNEY/, 'Disney+'], [/\bHBO\b|\bMAX\b/, 'Max'], [/PRIME VIDEO/, 'Prime Video'],
  [/YOUTUBE/, 'YouTube'], [/APPLE\.COM|ICLOUD/, 'Apple'], [/GOOGLE/, 'Google'], [/OPENAI|CHATGPT/, 'OpenAI'],
  [/CLAUDE|ANTHROPIC/, 'Claude'], [/ADOBE/, 'Adobe'], [/CANVA/, 'Canva'],
  [/AMAZON|AMZN/, 'Amazon'], [/MERCADO ?LIBRE/, 'Mercado Libre'], [/SHEIN/, 'Shein'], [/TEMU/, 'Temu'],
  [/ALIEXPRESS/, 'AliExpress'], [/EBANX/, 'Compra internacional (Ebanx)'],
  [/ETORO/, 'eToro'], [/PEXTO/, 'Pexto'], [/KUCOIN/, 'KuCoin'], [/BINANCE/, 'Binance'], [/\bTRII\b/, 'Trii'],
  [/NEQUI/, 'Nequi'], [/DAVIPLATA/, 'Daviplata'], [/BRE-?B/, 'Bre-B'],
  [/BANCOLOMBIA/, 'Bancolombia'], [/BANCO DE OCCIDE/, 'Banco de Occidente'], [/DAVIVIENDA/, 'Davivienda'],
  [/GASES DE OCCIDE/, 'Gases de Occidente'], [/EMCALI/, 'Emcali'], [/\bEPM\b/, 'EPM'], [/\bENEL\b/, 'Enel'],
  [/\bCLARO\b/, 'Claro'], [/MOVISTAR/, 'Movistar'], [/\bTIGO\b/, 'Tigo'], [/\bETB\b/, 'ETB'],
  [/GOU PAYMENTS/, 'GOU Payments (administración)'], [/MEDICINA PREPAGADA/, 'Medicina prepagada'],
  [/CINEMARK/, 'Cinemark'], [/CINE COLOMBIA/, 'Cine Colombia'], [/PROCINAL/, 'Procinal'],
  [/TERPEL/, 'Terpel'], [/TEXACO/, 'Texaco'], [/PRIMAX/, 'Primax'], [/BIOMAX/, 'Biomax'],
  [/CUOTA DE MANEJO/, 'Cuota de manejo'], [/INTERESES/, 'Intereses'], [/SEGURO/, 'Seguro'],
  [/NOMINA/, 'Nómina'], [/CESANTIAS/, 'Cesantías'], [/CUOTA DE CREDITO/, 'Cuota de crédito'],
  [/PAGO (DE )?TARJETA|TARJETA DE CRED/, 'Pago de tarjeta'], [/AVANCE/, 'Avance'],
  [/DEBITO AUTOMATICO/, 'Débito automático'],
];

const LEGAL = /\b(S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA\.?|S\.?\s?EN\s?C\.?|E\.?\s?U\.?|INC\.?|LTD\.?|LLC|CORP|COMP?|CO|SA|SAS|UK|COLOMBIA|COL)\b\.?/g;
const STOP = new Set(['EL', 'LA', 'LOS', 'LAS', 'DE', 'DEL', 'Y', 'EN', 'A', 'WWW', 'COM', 'ENLACE', 'APLICATIVO']);

function strip(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
}

export function normalizeMerchant(description) {
  let d = strip(description || '');
  if (!d) return { key: 'SIN-DESCRIPCION', name: 'Sin descripción' };

  for (const re of PREFIXES) d = d.replace(re, '');

  // Pasarela de pago: "BOLD SA*PELGY" → "PELGY"; "SHEIN COM*DL" → "SHEIN COM"
  if (d.includes('*')) {
    const [left, ...rest] = d.split('*');
    const right = rest.join(' ').trim();
    d = GATEWAYS.test(left.trim()) && right ? right : left.trim();
  }
  d = d.replace(/^WWW\./, '').replace(/\.(COM|CO|NET)\b.*/, '');

  const brand = BRANDS.find(([re]) => re.test(d));
  if (brand) return { key: strip(brand[1]).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''), name: brand[1] };

  const words = d.replace(LEGAL, ' ').replace(/[^A-Z0-9Ñ&\- ]/g, ' ').split(' ')
    .filter(w => w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  const core = words.slice(0, 2);
  // Sin palabras útiles (p. ej. solo números de cuenta): no se muestra ningún número
  if (!core.length) return { key: 'SIN-COMERCIO', name: 'Sin comercio identificado' };
  return { key: core.join('-'), name: titleCase(core.join(' ')) };
}

/**
 * Reglas aprendidas: cuando la persona corrige un movimiento y elige
 * "aplicar a todos", se guarda { [merchantKey]: { kind?, category? } }.
 * Se aplican a lo que ya está y a todo lo que llegue después.
 */
export function applyRule(tx, rules) {
  const rule = rules?.[tx.merchantKey];
  if (!rule || tx.editedByUser) return tx;
  const next = { ...tx, ruleApplied: true };
  if (rule.kind) next.kind = rule.kind;
  if (rule.category) next.category = rule.category;
  return next;
}
