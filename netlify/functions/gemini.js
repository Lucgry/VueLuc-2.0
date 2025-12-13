import { GoogleGenAI, Type } from "@google/genai";

const flightSchema = {
  type: Type.OBJECT,
  properties: {
    flightNumber: { type: Type.STRING },
    airline: { type: Type.STRING },
    departureAirportCode: { type: Type.STRING },
    departureCity: { type: Type.STRING },
    arrivalAirportCode: { type: Type.STRING },
    arrivalCity: { type: Type.STRING },
    departureDateTime: { type: Type.STRING },
    arrivalDateTime: { type: Type.STRING },
    cost: { type: Type.NUMBER },
    paymentMethod: { type: Type.STRING },
    bookingReference: { type: Type.STRING },
  },
  required: [
    "flightNumber",
    "departureAirportCode",
    "arrivalAirportCode",
    "departureDateTime",
    "arrivalDateTime",
    "bookingReference",
  ],
};

const tripSchema = {
  type: Type.OBJECT,
  properties: {
    flights: { type: Type.ARRAY, items: flightSchema },
    purchaseDate: { type: Type.STRING },
  },
  required: ["flights", "purchaseDate"],
};

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Si tu frontend llama desde el mismo dominio Netlify, esto no es estrictamente necesario,
      // pero no molesta y evita problemas si probás desde otros orígenes.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function safeJsonParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function handler(event) {
  // Preflight (por si el browser lo dispara)
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed. Use POST." });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "GOOGLE_API_KEY not set in Netlify env vars",
    });
  }

  // Parse body seguro
  const rawBody = event.body || "{}";
  const parsed = safeJsonParse(rawBody);
  if (!parsed.ok) {
    return jsonResponse(400, {
      error: "Invalid JSON body",
      details: "Body must be valid JSON.",
    });
  }

  const { emailText, pdfBase64 } = parsed.value || {};

  if (!emailText || typeof emailText !== "string" || !emailText.trim()) {
    return jsonResponse(400, { error: "emailText is required" });
  }

  // Normalizar pdfBase64
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

  const instructions = `
Eres un asistente de extracción de datos de vuelos. Convierte un email de vuelo a JSON según el esquema.

${pdfInstruction}

REGLAS ESTRICTAS:
1) Extrae CADA VUELO en 'flights' y cada uno con su 'bookingReference'.
2) NO INVENTES VUELOS.
3) COSTO: si hay desglose por tramo, asigna cada costo. Si solo hay total, asígnalo al PRIMER vuelo.
4) purchaseDate: busca fecha de compra/emisión. Si no aparece, usa la salida del primer vuelo como fallback.

FORMATO FECHA:
- ISO 8601: 'YYYY-MM-DDTHH:mm:ss'
- Si no hay año, deduce el año futuro más próximo.
`.trim();

  try {
    const ai = new GoogleGenAI({ apiKey });

    /** IMPORTANTE:
     * En @google/genai, `contents` debe ser un ARRAY de "Content",
     * típicamente: [{ role: "user", parts: [...] }]
     * Esto evita el error 400 "contents is not specified".
     */
    const parts = [
      { text: instructions },
      { text: `Texto del correo a analizar:\n---\n${emailText}\n---` },
    ];

    if (pdfData) {
      parts.push({
        inlineData: { mimeType: "application/pdf", data: pdfData },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: tripSchema,
      },
    });

    const parsedText = (response?.text || "").trim();
    if (!parsedText) {
      return jsonResponse(502, {
        error: "Empty response from Gemini",
      });
    }

    let json;
    try {
      json = JSON.parse(parsedText);
    } catch {
      // Si por alguna razón no devolvió JSON válido
      return jsonResponse(502, {
        error: "Gemini returned non-JSON output",
        details: parsedText.slice(0, 500),
      });
    }

    return jsonResponse(200, json);
  } catch (err) {
    // No loguees emailText/pdfBase64 aquí (para no filtrar datos).
    const message = err?.message || String(err);

    // Propagar errores de Gemini con status útil
    // (si querés más fino, podés inspeccionar err.status / err.code)
    return jsonResponse(500, { error: message });
  }
}
