import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Módulo 2: Parser Híbrido
 * Intenta usar Reglas/Regex para bancos conocidos antes de usar el LLM.
 * Soporta Anthropic (Claude 3.5 Sonnet), Gemini 1.5 Flash y OpenAI (GPT-4o-mini).
 * PRIORIDAD: Claude > Gemini > OpenAI
 */
export async function parseDocument(payload) {
  const { rawText, sourceId } = payload;
  
  const isBancolombia = /bancolombia/i.test(rawText);
  let parsedJson = null;
  let usedLLM = false;
  let parserConfidence = 1.0;
  let modelUsed = "none";

  if (isBancolombia && process.env.ENABLE_REGEX_PARSER === 'true') {
    // Regex Logic
  }

  if (!parsedJson) {
    usedLLM = true;
    parserConfidence = 0.95; // Claude es más confiable en extracción

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (anthropicKey) {
      // USAR CLAUDE HAIKU 4.5 (Rápido, económico y compatible)
      modelUsed = "claude-haiku-4-5";
      const url = "https://api.anthropic.com/v1/messages";
      
      const systemPrompt = `Eres un experto financiero. Extrae información estructurada de extractos bancarios. 
      Devuelve ÚNICAMENTE un objeto JSON con este formato:
      {
        "document_guess": "credit_card | bank_account | mortgage | loan",
        "issuer": "nombre del banco",
        "transactions": [{"date": "YYYY-MM-DD", "merchant": "nombre del comercio", "amount": numero_flotante}],
        "obligations": [{"type": "tipo de obligacion", "amount": numero_de_pago_mensual}]
      }
      No incluyas texto explicativo, solo el JSON.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ 
            role: "user", 
            content: `Analiza este texto y extrae los datos:\n\n${rawText.substring(0, 150000)}` 
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Claude API Error: ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const rawContent = result.content[0].text;
      const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try {
        parsedJson = JSON.parse(cleaned);
      } catch (e) {
        throw new Error(`Claude returned unparseable JSON. Raw: ${rawContent.substring(0, 200)}`);
      }

    } else if (geminiKey) {
      // USAR GEMINI 1.5 FLASH (REST API)
      modelUsed = "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      
      const prompt = `Extrae información financiera estructurada en JSON EXACTAMENTE con este formato:
      {
        "document_guess": "credit_card | bank_account | mortgage | loan",
        "issuer": "nombre del banco",
        "transactions": [{"date": "YYYY-MM-DD", "merchant": "nombre del comercio", "amount": numero}],
        "obligations": [{"type": "string", "amount": numero}]
      }`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\n\nTEXTO:\n${rawText.substring(0, 100000)}` }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const result = await response.json();
      const rawContent = result.candidates[0].content.parts[0].text;
      const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try {
        parsedJson = JSON.parse(cleaned);
      } catch (e) {
        throw new Error(`Gemini returned unparseable JSON. Raw: ${rawContent.substring(0, 200)}`);
      }

    } else {
      // FALLBACK: OPENAI GPT-4O-MINI
      modelUsed = "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Extrae información financiera en JSON." },
          { role: "user", content: rawText ? rawText.substring(0, 10000) : "" }
        ]
      });
      parsedJson = JSON.parse(response.choices[0].message.content);
    }
  }

  return {
    ...payload,
    parsedJson,
    metadata: { usedLLM, parserConfidence, modelUsed }
  };
}
