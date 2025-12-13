// netlify/functions/gemini.ts

function jsonResponse(statusCode: number, obj: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function safeJsonParse(str: string) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function handler(event: any) {
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
      error: "GEMINI_API_KEY not set in Netlify environment variables",
    });
  }

  // Parse body seguro
  const rawBody = event.body || "{}";
  const parsed = safeJsonParse(rawBody);
  if (!parsed.ok) {
    return jsonResponse(400, {
      error: "Invalid JSON body",
      details: "Body must be valid JSON",
    });
  }

  const { emailText, pdfBase64 } = parsed.value || {};

  if (!emailText || typeof emailText !== "string" || !emailText.trim()) {
    return jsonResponse(400, { error: "emailText is required" });
  }

  const pdfData =
    typeof pdfBase64 === "string" && pdfBase64.trim().length > 0
      ? pdfBase64.trim()
      : null;

  const pdfInstruction = pdfData
    ? `
DATOS DEL PDF ADJUNTO:
- Hay un PDF adjunto que puede contener el costo total o facturación.
- Priorizá el costo encontrado en el PDF si el email no desglosa por tramo.
`.trim()
    : "";

  // 🔒 Instrucciones estrictas + esquema en texto
  const instructions = `
Eres un asistente de extracción de datos de vuelos.
Devuelve ÚNICAMENTE JSON válido (sin markdown, sin texto adicional).

${pdfInstruction}

ESQUEMA OBLIGATORIO:
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

REGLAS ESTRICTAS:
1) Extrae CADA VUELO en "flights".
2) NO INVENTES DATOS.
3) bookingReference es OBLIGATORIO.
4) COSTO:
   - Si hay desglose por tramo, asigna cada costo.
   - Si solo hay un total, asignalo al PRIMER vuelo.
5) purchaseDate:
   - Usá fecha de compra/emisión.
   - Si no existe, usá la salida del primer vuelo.
6) Fechas en ISO 8601.
7) Si falta el año, deducí el año futuro más próximo.
`.trim();

  const prompt = `
${instructions}

TEXTO DEL EMAIL:
---
${emailText}
---
`.trim();

  try {
    const response = await fetch(
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

    const text = await response.text();

    if (!response.ok) {
      return jsonResponse(response.status, {
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
  } catch (err: any) {
    return jsonResponse(500, {
      error: "Function crashed",
      message: err?.message || String(err),
    });
  }
}
