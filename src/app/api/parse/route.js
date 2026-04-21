import { NextResponse } from 'next/server';
import { runPipeline } from '../../../lib/engine/pipeline';

export async function POST(req) {
  try {
    const { text, filename, period } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Por ahora forzamos un usuario por defecto
    const userId = "default-user";

    // Llamamos al orquestador modular en su lugar
    const pipelineResult = await runPipeline({
      userId,
      type: 'pdf',
      originalFilename: filename || 'statement.pdf',
      rawText: text,
      period: period || null
    });

    if (!pipelineResult.success) {
      throw new Error(pipelineResult.error);
    }

    // Adaptamos la respuesta del pipeline para que el frontend no se rompa inmediatamente
    // Extraemos la información que el frontend usa (state)
    const engineState = pipelineResult.data;
    
    // Reconstruimos un JSON amigable para la vista en Base de Datos de UI
    const responseAdapter = {
      document_type: engineState.documentType,
      confidence_score: engineState.finalConfidence,
      transactions: engineState.transactions.map(t => ({
         merchant_raw: t.merchantRaw,
         merchant_normalized: t.merchantNormalized,
         amount_gross: t.amount,
         category_guess: t.category || "General",
         row_type: t.rowType,
         subscription_candidate: t.subscriptionCandidate,
         date: t.transactionDate.toISOString().split('T')[0]
      })),
      fixed_obligations: engineState.normalizedObligations.map(o => ({
         obligation_type: o.obligationType,
         issuer_name: o.issuer,
         payment_value_current: o.paymentValue
      })),
      insights: engineState.insights // Enviamos los insights también
    };

    return NextResponse.json(responseAdapter);

  } catch (error) {
    console.error("CRITICAL API ERROR:", error);
    // Extraemos el mensaje más descriptivo posible
    const errorMessage = error.message || "Unknown error in pipeline";
    return NextResponse.json({ 
      error: "Failed to process document", 
      details: errorMessage 
    }, { status: 500 });
  }
}
