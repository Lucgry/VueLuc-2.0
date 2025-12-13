// netlify/functions/gemini.cjs

const jsonResponse = (statusCode, obj) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  },
  body: JSON.stringify(obj),
});

const safeJsonParse = (str) => {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e };
  }
};

// Extrae el PRIMER bloque JSON válido { ... } de un texto
const extractFirstJsonObject = (text) => {
  if (typeof text !== "string") return null;

  // Quitar fences tipo ```json
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  for (let i = firstBrace; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) {
      return cleaned.slice(firstBrace, i + 1);
    }
  }

  return null;
};

async function listModels(apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const text = await resp.text();
  return { status: resp.status, ok: resp.ok, text };
}

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "GOOGLE_API_KEY not set in Netlify env vars",
    });
  }

  // Diagnóstico opcional
  if (
    event.httpMethod === "GET" &&
    event.queryStringParameters?.listModels === "1"
  ) {
    try {
      const { status, ok, text } = await listModels(apiKey);
      return jsonResponse(status, ok ? JSON.parse(text) : { error: text });
    } catch (e) {
      return jsonResponse(500, {
        error: "ListModels failed",
        message: e.message || String(e),
      });
    }
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed. Use POST." });
  }

  const parsed = safeJsonParse(event.body || "{}");
  if (!parsed.ok) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { emailText, pdfBase64 } = parsed.value;

  if (!emailText || typeof emailText !== "string" || !emailText.trim()) {
    return jsonResponse(400, { error: "emailText is required" });
  }

  const pdfData =
    typeof pdfBase64 === "string" && pdfBase64.trim()
      ? pdfBase64.trim()
      : null;

  const pdfInstruction = pdfData
    ? `
DATOS DEL PDF ADJUNTO:
- Hay un PDF adjunto que puede contener el costo total o facturación.
- Priorizá el costo encontrado en el PDF si el email no desglosa por tramo.
`.trim()
    : "";

  const instructions = `
Eres un asistente de extracción de datos de vuelos.
Devuelve ÚNICAMENTE JSON válido.
NO markdown. NO texto adicional.

${pdfInstruction}

ESQUEMA:
{
  "flights": [
    {
      "flightNumber": "string",
      "airline": "string",
      "departureAirportCode": "string",
      "departureCity": "string",
      "arrivalAirportCode": "string",
      "arrivalCity": "string",
      "departureDateTime": "YYYY-MM-DDTHH:mm:ss",
      "arrivalDateTime": "YYYY-MM-DDTHH:mm:ss",
      "cost": number,
      "paymentMethod": "string",
      "bookingReference": "string"
    }
  ],
  "purchaseDate": "YYYY-MM-DDTHH:mm:ss"
}

REGLAS:
- NO inventes datos
- bookingReference es obligatorio
- Si hay costo total, asignalo al primer vuelo
`.trim();

  const prompt = `
${instructions}

EMAIL:
---
${emailText}
---
`.trim();

  try {
    const model = "gemini-2.5-flash";

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...(pdfData
                  ? [
                      {
                        inlineData: {
                          mimeType: "application/pdf",
                          data: pdfData,
                        },
                      },
                    ]
                  : []),
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    const rawText = await resp.text();

    if (!resp.ok) {
      return jsonResponse(resp.status, {
        error: "Gemini API error",
        modelUsed: model,
        details: rawText.slice(0, 2000),
      });
    }

    // 1) Parse wrapper Gemini
    const wrapper = safeJsonParse(rawText);
    if (!wrapper.ok) {
      return jsonResponse(502, {
        error: "Gemini wrapper is not valid JSON",
        details: rawText.slice(0, 800),
      });
    }

    // 2) Extraer texto del modelo
    const candidateText =
      wrapper.value?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return jsonResponse(502, {
        error: "Gemini response missing content text",
        details: JSON.stringify(wrapper.value).slice(0, 800),
      });
    }

    // 3) Extraer JSON real
    const jsonBlock = extractFirstJsonObject(candidateText);
    if (!jsonBlock) {
      return jsonResponse(502, {
        error: "No JSON object found in Gemini content",
        details: candidateText.slice(0, 800),
      });
    }

    // 4) Parse final
    const finalJson = safeJsonParse(jsonBlock);
    if (!finalJson.ok) {
      return jsonResponse(502, {
        error: "Extracted JSON is invalid",
        details: jsonBlock.slice(0, 800),
      });
    }

    return jsonResponse(200, finalJson.value);
  } catch (err) {
    return jsonResponse(500, {
      error: "Function crashed",
      message: err.message || String(err),
    });
  }
};
