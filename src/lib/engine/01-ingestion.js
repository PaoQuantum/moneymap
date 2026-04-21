import { prisma } from '../prisma';

/**
 * Módulo 1: Ingesta de fuentes
 * Recibe la metadata del archivo o texto y crea un registro en la base de datos.
 */
export async function ingestSource({ userId, type, originalFilename, rawText, period }) {
  // Asegurarnos de que exista el usuario (Para propósitos de esta V1 sin Auth)
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    if (userId === 'default-user') {
      user = await prisma.user.create({
        data: { id: 'default-user', email: 'demo@moneymap.app' }
      });
    } else {
      throw new Error("User not found");
    }
  }

  // 1. Crear la fuente (El "job")
  const source = await prisma.source.create({
    data: {
      userId: user.id,
      type: type || 'pdf',
      originalFilename: originalFilename || 'uploaded_document.pdf',
      status: 'processing',
      period: period || null
    }
  });

  return { sourceId: source.id, rawText, userId: user.id };
}
