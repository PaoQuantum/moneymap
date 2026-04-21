import { ingestSource } from './01-ingestion';
import { parseDocument } from './02-parser';
import { classifyDocument } from './03-classifier';
import { normalizeData } from './04-normalizer';
import { deduplicate } from './05-deduplicator';
import { detectRecurrence } from './06-recurrence';
import { generateInsights } from './07-insights';
import { computeConfidence } from './08-confidence';

/**
 * MoneyMap Engine Pipeline Orchestrator
 * Encadena los 8 módulos en secuencia y pasa el estado propagado.
 */
export async function runPipeline({ userId, type, originalFilename, rawText, period }) {
  try {
    // 1. Ingesta
    let state = await ingestSource({ userId, type, originalFilename, rawText, period });
    
    // 2. Extracción Híbrida
    state = await parseDocument(state);

    // 3. Clasificación
    state = await classifyDocument(state);

    // 4. Normalización
    state = await normalizeData(state);

    // 5. Deduplicación
    state = await deduplicate(state);

    // 6. Recurrencia
    state = await detectRecurrence(state);

    // 7. Insights
    state = await generateInsights(state);

    // 8. Confianza Final y Commit
    state = await computeConfidence(state);

    return {
      success: true,
      data: state
    };
  } catch (error) {
    console.error("Pipeline Error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
