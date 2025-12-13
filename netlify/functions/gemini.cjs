// netlify/functions/gemini.cjs

const jsonResponse = (statusCode, obj) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "GEMINI_API_KEY not set in Netlify env vars",
    });
  }

  const parsed = safeJsonParse(event.body || "{}");
  if (!parsed.ok) {
    return jsonResponse(400, {
      error: "Invalid JSON body",
    });
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
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
        details: text.slice(0, 2000),
      });
    }

    const parsedGemini = safeJsonParse(text);
    if (!parsedGemini.ok) {
      return jsonResponse(502, {
        error: "Gemini returned invalid JSON",
        details: text.slice(0, 500),
      });
    }

    return jsonResponse(200, parsedGemini.value);
  } catch (err) {
    return jsonResponse(500, {
      error: "Function crashed",
      message: err.message || String(err),
    });
  }
};
