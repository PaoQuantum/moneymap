import { prisma } from '../prisma';

/**
 * Módulo 3: Classifier
 * Determina el tipo de documento exacto (Tarjeta de crédito, Hipoteca, etc.)
 */
export async function classifyDocument(payload) {
  const { sourceId, parsedJson, metadata, userId } = payload;
  
  // Mapeamos el valor corto que devuelve el LLM al tipo canónico del sistema
  const GUESS_MAP = {
    credit_card: "credit_card_statement",
    mortgage:    "mortgage_statement",
    loan:        "consumer_loan_statement",
  };
  let docType = GUESS_MAP[parsedJson.document_guess] || "unknown";

  if (docType === "unknown" && parsedJson.obligations && parsedJson.obligations.length > 0) {
     const ob = parsedJson.obligations[0];
     if (ob.type.toLowerCase().includes("hipotec") || ob.type.toLowerCase().includes("mortgage")) {
        docType = "mortgage_statement";
     }
  }

  // Creamos el registro del documento formal en la DB
  const doc = await prisma.document.create({
    data: {
      sourceId,
      userId,
      documentType: docType,
      issuer: parsedJson.issuer || "Unknown",
      parsedJson: JSON.stringify(parsedJson),
      confidenceScore: metadata.parserConfidence
    }
  });

  return {
    ...payload,
    documentId: doc.id,
    documentType: docType
  };
}
