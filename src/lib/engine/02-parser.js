import OpenAI from 'openai';

let openaiClient = null;
function getOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Fallback heuristic extraction when no LLM API keys are provided
function heuristicExtract(rawText) {
  const transactions = [];
  const lines = rawText.split(/\r?\n|\s{3,}/);
  const dateRegex = /\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b/;
  const amountRegex = /(?:\$|COP|USD)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+(?:\.[0-9]+)?)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;
    const dateMatch = trimmed.match(dateRegex);
    const amountMatch = trimmed.match(amountRegex);

    if (dateMatch && amountMatch) {
      let cleanAmount = amountMatch[1].replace(/\./g, '').replace(/,/g, '.');
      const numAmount = parseFloat(cleanAmount);
      if (!isNaN(numAmount) && numAmount > 0) {
        let merchant = trimmed
          .replace(dateMatch[0], '')
          .replace(amountMatch[0], '')
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .trim();
        if (merchant.length > 2) {
          transactions.push({
            date: dateMatch[1].length === 10 && dateMatch[1].includes('-') ? dateMatch[1] : new Date().toISOString().split('T')[0],
            merchant: merchant.substring(0, 40),
            amount: numAmount
          });
        }
      }
    }
  }

  const isCreditCard = /tarjeta|credit|visa|mastercard|cupo/i.test(rawText);
  const isMortgage = /hipotec|vivienda|uvr/i.test(rawText);
  const isLoan = /prestamo|credito|libranza/i.test(rawText);
  const docGuess = isCreditCard ? "credit_card" : (isMortgage ? "mortgage" : (isLoan ? "loan" : "bank_account"));

  let issuer = "Banco";
  if (/bancolombia/i.test(rawText)) issuer = "Bancolombia";
  else if (/davivienda/i.test(rawText)) issuer = "Davivienda";
  else if (/bbva/i.test(rawText)) issuer = "BBVA";
  else if (/bogota/i.test(rawText)) issuer = "Banco de Bogotá";
  else if (/falabella/i.test(rawText)) issuer = "Banco Falabella";

  return {
    document_guess: docGuess,
    issuer,
    transactions: transactions.slice(0, 30),
    obligations: []
  };
}

/**
 * Módulo 2: Parser Híbrido
 * Intenta usar Reglas/Regex para bancos conocidos antes de usar el LLM.
 * Soporta Anthropic (Claude 3.5 Sonnet), Gemini 1.5/2.5 Flash y OpenAI (GPT-4o-mini).
 * PRIORIDAD: Claude > Gemini > OpenAI > Heuristics
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
    parserConfidence = 0.95;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    
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
        const errorData = await response.json().catch(() => ({}));
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
      // USAR GEMINI FLASH (REST API)
      modelUsed = "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      
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

      if (response.ok) {
        const result = await response.json();
        const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        try {
          parsedJson = JSON.parse(cleaned);
        } catch (e) {
          console.warn("Gemini parse fallback to heuristic:", e?.message);
          parsedJson = heuristicExtract(rawText);
        }
      } else {
        console.warn("Gemini API call failed, falling back to heuristic parsing");
        parsedJson = heuristicExtract(rawText);
      }

    } else if (openaiKey) {
      // FALLBACK: OPENAI GPT-4O-MINI
      modelUsed = "gpt-4o-mini";
      const client = getOpenAI();
      if (client) {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Extrae información financiera en JSON." },
            { role: "user", content: rawText ? rawText.substring(0, 10000) : "" }
          ]
        });
        parsedJson = JSON.parse(response.choices[0].message.content);
      } else {
        parsedJson = heuristicExtract(rawText);
      }
    } else {
      // No external API key present - run local heuristic parser
      modelUsed = "heuristic-regex";
      usedLLM = false;
      parserConfidence = 0.85;
      parsedJson = heuristicExtract(rawText);
    }
  }

  return {
    ...payload,
    parsedJson,
    metadata: { usedLLM, parserConfidence, modelUsed }
  };
}

