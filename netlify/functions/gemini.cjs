// netlify/functions/gemini.cjs

const jsonResponse = (statusCode, obj) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    // Incluyo GET para poder usar ?listModels=1
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

// Cache simple en memoria (vive entre invocaciones si el container no rota)
let cachedModel = null;
let cachedAt = 0;
const CACHE_MS = 10 * 60 * 1000; // 10 minutos

async function listModels(apiKey) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const text = await resp.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`ListModels returned non-JSON: ${text.slice(0, 500)}`);
  }

  if (!resp.ok) {
    throw new Error(
      `ListModels error ${resp.status}: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  return data;
}

/**
 * Elige un modelo que:
 * - sea "models/..."
 * - soporte generateContent
 * Priorizamos modelos Gemini recientes si existen.
 */
async function pickModel(apiKey) {
  // Cache
  if (cachedModel && Date.now() - cachedAt < CACHE_MS) return cachedModel;

  const data = await listModels(apiKey);
  const models = Array.isArray(data?.models) ? data.models : [];

  // Filtrar los que soportan generateContent
  const candidates = models.filter((m) => {
    const name = m?.name || "";
    const methods = m?.supportedGenerationMethods || [];
    return (
      typeof name === "string" &&
      name.startsWith("models/") &&
      Array.isArray(methods) &&
      methods.includes("generateContent")
    );
  });

  // Orden de preferencia por nombre (si están disponibles)
  const preference = [
    "gemini-2.0",
    "gemini-1.5",
    "gemini",
  ];

  // Si hay modelos con "gemini" en el nombre, preferirlos
  const geminiCandidates = candidates.filter((m) =>
    (m?.name || "").toLowerCase().includes("gemini")
  );

  const pool = geminiCandidates.length ? geminiCandidates : candidates;

  // Rank por preferencia
  pool.sort((a, b) => {
    const an = (a.name || "").toLowerCase();
    const bn = (b.name || "").toLowerCase();
    const ar = preference.findIndex((p) => an.includes(p));
    const br = preference.findIndex((p) => bn.includes(p));
    const arank = ar === -1 ? 999 : ar;
    const brank = br === -1 ? 999 : br;
    return arank - brank;
  });

  if (!pool.length) {
    throw new Error(
      "No models found that support generateContent for this API key (v1beta)."
    );
  }

  cachedModel = pool[0].name; // Ej: "models/gemini-1.5-flash-latest"
  cachedAt = Date.now();
  return cachedModel;
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

  // ✅ Endpoint de diagnóstico: lista modelos disponibles
  if (
    event.httpMethod === "GET" &&
    event.queryStringParameters &&
    event.queryStringParameters.listModels === "1"
  ) {
    try {
      const data = await listModels(apiKey);
      return jsonResponse(200, data);
    } catch (e) {
      return jsonResponse(500, { error: "ListModels failed", message: e.message || String(e) });
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
    typeof pdfBase64 === "string" && pdfBase64.trim() ? pdfBase64.trim() : null;

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
    // ✅ Elegir modelo válido automáticamente
    const modelName = await pickModel(apiKey); // ej: "models/gemini-1.5-flash-latest"

    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    const resp = await fetch(url, {
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
    });

    const text = await resp.text();

    if (!resp.ok) {
      return jsonResponse(resp.status, {
        error: "Gemini API error",
        modelUsed: modelName,
        details: text.slice(0, 2000),
      });
    }

    const parsedGemini = safeJsonParse(text);
    if (!parsedGemini.ok) {
      return jsonResponse(502, {
        error: "Gemini returned invalid JSON",
        modelUsed: modelName,
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
