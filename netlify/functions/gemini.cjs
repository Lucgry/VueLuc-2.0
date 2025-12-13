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
  } catch {
    return { ok: false };
  }
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

  // Diagnóstico: listar modelos
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
Devuelve ÚNICAMENTE JSON válido (sin markdown, sin texto adicional).

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
    // ✅ Modelo correcto según tu ListModels
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

    const text = await resp.text();

    if (!resp.ok) {
      return jsonResponse(resp.status, {
        error: "Gemini API error",
        modelUsed: model,
        details: text.slice(0, 2000),
      });
    }

    // 1) Parsear la respuesta completa de Gemini
    const parsedGemini = safeJsonParse(text);
    if (!parsedGemini.ok) {
      return jsonResponse(502, {
        error: "Gemini returned invalid JSON (wrapper)",
        modelUsed: model,
        details: text.slice(0, 500),
      });
    }

    // 2) Extraer el texto que contiene el JSON “final”
    const candidateText =
      parsedGemini.value?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText || typeof candidateText !== "string") {
      return jsonResponse(502, {
        error: "Gemini response missing content text",
        modelUsed: model,
        details: JSON.stringify(parsedGemini.value).slice(0, 800),
      });
    }

    // 3) Parsear ese JSON final
    const finalJson = safeJsonParse(candidateText);
    if (!finalJson.ok) {
      return jsonResponse(502, {
        error: "Gemini content is not valid JSON",
        modelUsed: model,
        details: candidateText.slice(0, 800),
      });
    }

    // 4) Devolver SOLO el JSON final (lo que tu app espera)
    return jsonResponse(200, finalJson.value);
  } catch (err) {
    return jsonResponse(500, {
      error: "Function crashed",
      message: err.message || String(err),
    });
  }
};
