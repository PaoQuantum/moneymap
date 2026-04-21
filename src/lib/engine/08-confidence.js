import { prisma } from '../prisma';

/**
 * Módulo 8: Sistema de Confianza
 * Promedia los puntajes y emite la calificación final del pipeline.
 */
export async function computeConfidence(payload) {
  const { sourceId, metadata, transactions } = payload;
  
  // Base confidence dictada por el Parser híbrido
  let globalScore = metadata.parserConfidence || 1.0;

  // Penalización por cantidad de deduplicados (si hubo duplicados exactos, tal vez subió el mismo archivo dos veces)
  const duplicates = transactions.filter(t => t.isDuplicate).length;
  if (duplicates > 0 && transactions.length > 0) {
     const dupRatio = duplicates / transactions.length;
     globalScore -= (dupRatio * 0.2); // Hasta 20% de penalidad
  }

  // Asegurar límites [0.1, 1.0]
  globalScore = Math.max(0.1, Math.min(1.0, globalScore));

  // Acumular la confianza en el registro del Doc y de la Fuente
  if (payload.documentId) {
     await prisma.document.update({
       where: { id: payload.documentId },
       data: { confidenceScore: globalScore }
     });
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { status: 'completed' }
  });

  return {
    ...payload,
    finalConfidence: globalScore
  };
}
