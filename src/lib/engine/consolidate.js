import { prisma } from '../prisma';

/**
 * Consolidates all transactions and obligations for a userId + period.
 * Reads from DB — does not run the pipeline.
 * Designed to back the future /api/consolidate endpoint.
 */
export async function consolidatePeriod(userId, period) {
  if (!userId || !period) {
    throw new Error('consolidatePeriod requires userId and period');
  }

  // All transactions for this user in this period
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      source: { is: { period } }
    },
    orderBy: { transactionDate: 'desc' }
  });

  // All obligations for this user in this period (via Document → Source)
  const obligations = await prisma.obligation.findMany({
    where: {
      document: { is: { source: { userId, period } } }
    }
  });

  // Metadata: how many sources and which document types contributed
  const sources = await prisma.source.findMany({
    where: { userId, period },
    include: { documents: { select: { documentType: true } } }
  });

  const documentTypes = [
    ...new Set(sources.flatMap(s => s.documents.map(d => d.documentType)))
  ];

  // Dedup en memoria por (merchant, date, amount) para eliminar ruido de uploads repetidos
  const seen = new Set();
  const dedupedTx = transactions.filter(t => {
    const key = `${t.merchantNormalized}|${t.transactionDate.toISOString().split('T')[0]}|${t.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Insight básico de suscripciones para que applyResult calcule potential_savings
  const subsTotal = dedupedTx
    .filter(t => t.subscriptionCandidate)
    .reduce((sum, t) => sum + t.amount, 0);
  const insights = subsTotal > 0
    ? [{ insightType: 'optimization', title: 'Suscripciones detectadas',
         description: `Tienes $${subsTotal.toLocaleString('es-CO')} en cobros recurrentes este periodo.`,
         amount: subsTotal }]
    : [];

  return {
    period,
    sources_count: sources.length,
    document_types: documentTypes,
    transactions: dedupedTx.map(t => ({
      merchant_raw:           t.merchantRaw,
      merchant_normalized:    t.merchantNormalized,
      amount_gross:           t.amount,
      category_guess:         t.category,
      row_type:               t.rowType,
      subscription_candidate: t.subscriptionCandidate,
      date:                   t.transactionDate.toISOString().split('T')[0]
    })),
    fixed_obligations: obligations.map(o => ({
      obligation_type:       o.obligationType,
      issuer_name:           o.issuer,
      payment_value_current: o.paymentValue
    })),
    insights
  };
}
