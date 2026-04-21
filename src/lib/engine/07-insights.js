import { prisma } from '../prisma';

/**
 * Módulo 7: Insights
 * Interpreta estructuradamente y guarda alertas que el front consumirá instántaneamente.
 */
export async function generateInsights(payload) {
  const { userId, transactions, normalizedObligations } = payload;
  const insightsGenerated = [];

  // 1. Detección de Fugas: Suscripciones Altas
  const subs = transactions.filter(t => t.subscriptionCandidate);
  if (subs.length > 3) {
     const insight = await prisma.insight.create({
        data: {
          userId,
          insightType: 'optimization',
          title: 'Exceso de Suscripciones',
          description: `Identificamos ${subs.length} cobros recurrentes recientes. Asegúrate de usarlos todos.`,
          amount: subs.reduce((sum, t) => sum + t.amount, 0)
        }
     });
     insightsGenerated.push(insight);
  }

  // 2. Detección de Aumento en Categoría (Mock: Simulamos que validamos contra mes anterior)
  // En código real: SELECT SUM(amount) WHERE current_month vs prev_month
  const transportation = transactions.filter(t => t.category === "Transporte" || t.merchantNormalized === "Uber" || t.merchantNormalized.toLowerCase().includes("shell"));
  const transTotal = transportation.reduce((sum, t) => sum + t.amount, 0);
  
  if (transTotal > 100000) { // Umbral de alerta mock
     const insight = await prisma.insight.create({
        data: {
          userId,
          insightType: 'warning',
          title: 'Pico en Transporte',
          description: 'Tus gastos de transporte están inusualmente altos este periodo.',
          amount: transTotal
        }
     });
     insightsGenerated.push(insight);
  }

  // 3. Obligaciones fijas
  if (normalizedObligations.length > 0) {
      const fixedTotal = normalizedObligations.reduce((sum, o) => sum + o.paymentValue, 0);
      const insight = await prisma.insight.create({
        data: {
          userId,
          insightType: 'info',
          title: 'Carga Fija Detectada',
          description: `Se procesaron las nuevas cuotas de créditos y seguros.`,
          amount: fixedTotal
        }
     });
     insightsGenerated.push(insight);
  }

  return {
    ...payload,
    insights: insightsGenerated
  };
}
