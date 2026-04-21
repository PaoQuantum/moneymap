import { prisma } from '../prisma';

/**
 * Módulo 4: Normalizador Financiero
 * Limpia fechas, montos e infiere nombres estandarizados de comercios usando Base de Datos
 */
export async function normalizeData(payload) {
  const { parsedJson } = payload;
  let normalizedTransactions = [];
  let normalizedObligations = [];

  // Obtener alías conocidos de comercios desde la BD para normalizar
  // En producción usaríamos un caché como Redis
  const aliases = await prisma.merchantAlias.findMany();
  const aliasMap = {};
  aliases.forEach(a => { aliasMap[a.rawName.toLowerCase()] = a.normalizedName });

  const PAYMENT_RE = /^(pago|abono|payment|transferencia|cuota|devolucion|reverso)/i;

  const CATEGORY_MAP = [
    [/uber|taxi|cabify|didi|beat/i,                                                    'Transporte'],
    [/netflix|spotify|apple music|disney|hbo|youtube|prime|adobe|icloud/i,            'Entretenimiento'],
    [/rappi|domicilios|ifood|uber eats|glovo/i,                                        'Comida'],
    [/jumbo|exito|carulla|olympica|ara|d1|mercado pago/i,                              'Supermercado'],
    [/amazon|mercado libre|ebay|shein|temu/i,                                          'Compras Online'],
    [/homecenter|ikea|easy|sodimac/i,                                                  'Hogar'],
    [/digitalocean|openai|chatgpt|google cloud|aws|github|vercel/i,                   'Tecnología'],
    [/facebook|meta ads|google ads|tiktok ads/i,                                       'Publicidad'],
    [/payu|stripe|wompi|bold/i,                                                        'Servicios'],
    [/shell|terpel|biomax|mobil/i,                                                     'Gasolina'],
  ];

  if (parsedJson.transactions) {
     normalizedTransactions = parsedJson.transactions.map(tx => {
       const rawLower = (tx.merchant || "").toLowerCase();
       let normalized = tx.merchant;

       // Búsqueda simple de alias (en la realidad sería búsqueda difusa o substring matcher)
       for (const [rawKey, normValue] of Object.entries(aliasMap)) {
         if (rawLower.includes(rawKey)) {
           normalized = normValue;
           break;
         }
       }

       // Heurísticas básicas por si el alias falla
       if (!normalized && rawLower.includes("uber")) normalized = "Uber";
       if (!normalized && rawLower.includes("netflix")) normalized = "Netflix";
       if (!normalized && rawLower.includes("spotify")) normalized = "Spotify";

       const matchedCat = CATEGORY_MAP.find(([re]) => re.test(normalized || rawLower));
       const category = matchedCat ? matchedCat[1] : 'General';

       // Asegurar fechas (Fallback a hoy si la fecha es inválida o ausente)
       const _parsed = new Date(tx.date);
       const txDate = (tx.date && !isNaN(_parsed.getTime())) ? _parsed : new Date();

       const rowType = PAYMENT_RE.test(tx.merchant || '') || (tx.amount || 0) < 0
         ? 'payment' : 'purchase';

       return {
         ...tx,
         transactionDate: txDate,
         merchantRaw: tx.merchant || "Desconocido",
         merchantNormalized: normalized || "Desconocido",
         amount: Math.abs(tx.amount || 0),
         category,
         rowType
       };
     });
  }

  if (parsedJson.obligations) {
     normalizedObligations = parsedJson.obligations.map(ob => ({
       ...ob,
       obligationType: ob.type || "unknown",
       paymentValue: Math.abs(ob.amount || 0)
     }));
  }

  return {
    ...payload,
    normalizedTransactions,
    normalizedObligations
  };
}
