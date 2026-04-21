import { prisma } from '../prisma';

/**
 * Módulo 5: Deduplicación
 * Previene que el mismo gasto subido en un PDF y luego en un Correo duplique los egresos.
 */
export async function deduplicate(payload) {
  const { normalizedTransactions, userId, sourceId, documentId } = payload;
  const deduplicated = [];

  for (const tx of normalizedTransactions) {
     // Buscar posibles colisiones en la BD en una ventana de +/- 3 días
     const dateThresholdStart = new Date(tx.transactionDate);
     dateThresholdStart.setDate(dateThresholdStart.getDate() - 3);
     
     const dateThresholdEnd = new Date(tx.transactionDate);
     dateThresholdEnd.setDate(dateThresholdEnd.getDate() + 3);

     // Buscamos exact match en monto y normalized name cerca en fecha
     const possibleDuplicate = await prisma.transaction.findFirst({
       where: {
         userId,
         amount: tx.amount,
         merchantNormalized: tx.merchantNormalized,
         transactionDate: {
           gte: dateThresholdStart,
           lte: dateThresholdEnd
         }
       }
     });

     let duplicateGroupId = null;

     if (possibleDuplicate) {
        // Encontramos un duplicado existente. Reusamos su `id` como `groupId`
        duplicateGroupId = possibleDuplicate.duplicateGroupId || possibleDuplicate.id;
        
        // Si el posible duplicado no tenía un grupo, lo actualizamos
        if (!possibleDuplicate.duplicateGroupId) {
           await prisma.transaction.update({
             where: { id: possibleDuplicate.id },
             data: { duplicateGroupId: duplicateGroupId }
           });
        }
     }

     // Insertar en la BD la transacción, marcando el link de duplicado
     const dbTx = await prisma.transaction.create({
       data: {
         userId,
         documentId,
         sourceId,
         transactionDate: tx.transactionDate,
         merchantRaw: tx.merchantRaw,
         merchantNormalized: tx.merchantNormalized,
         amount: tx.amount,
         rowType: tx.rowType,
         category: tx.category || "General",
         duplicateGroupId
       }
     });

     // Al payload en memoria le agregamos la bandera para que el frontend lo sepa
     deduplicated.push({
       ...tx,
       dbId: dbTx.id,
       isDuplicate: !!duplicateGroupId
     });
  }

  return {
    ...payload,
    transactions: deduplicated
  };
}
