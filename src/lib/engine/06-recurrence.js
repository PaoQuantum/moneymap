import { prisma } from '../prisma';

/**
 * Módulo 6: Motor de Recurrencia
 * Compara el historial global del usuario para marcar posibles suscripciones.
 */
export async function detectRecurrence(payload) {
  const { transactions, userId } = payload;
  
  const KNOWN_SUBS = /netflix|spotify|apple music|disney|hbo|youtube premium|prime video|adobe|chatgpt|openai|google one|icloud|crunchyroll|deezer|paramount/i;

  // Primera pasada: suscripciones conocidas sin depender del historial DB
  for (const t of transactions) {
    if (KNOWN_SUBS.test(t.merchantNormalized)) {
      t.subscriptionCandidate = true;
      await prisma.transaction.update({
        where: { id: t.dbId },
        data: { subscriptionCandidate: true }
      });
    }
  }

  // Segunda pasada: historial DB para merchants no cubiertos por la lista estática
  const uniqueMerchants = [...new Set(transactions.map(t => t.merchantNormalized))];

  for (const merchant of uniqueMerchants) {
     const history = await prisma.transaction.findMany({
       where: {
         userId,
         merchantNormalized: merchant,
         // Ignorar los que ya marcamos como duplicados
         duplicateGroupId: null
       },
       orderBy: { transactionDate: 'asc' }
     });

     if (history.length >= 2) {
        const amounts = history.map(h => h.amount);
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const isConsistent = avg > 0 && amounts.every(a => Math.abs(a - avg) / avg < 0.25);

        if (isConsistent) {
          await prisma.transaction.updateMany({
             where: { userId, merchantNormalized: merchant },
             data: { subscriptionCandidate: true }
          });
          transactions.forEach(t => {
             if (t.merchantNormalized === merchant) t.subscriptionCandidate = true;
          });
        }
     }
  }

  return {
    ...payload,
    transactions
  };
}
