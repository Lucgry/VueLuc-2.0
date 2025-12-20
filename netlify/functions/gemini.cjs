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
    const ch = cleaned[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return cleaned.slice(firstBrace, i + 1);
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

/**
 * Heurística: recorta el email a “lo probable útil” para vuelos.
 * Esto mejora MUCHO JetSMART (trae regulaciones larguísimas).
 */
function extractRelevantEmailSection(emailText) {
  if (typeof emailText !== "string") return "";

  const t = emailText;

  // Intento 1: JetSMART típico
  const jetStart = t.search(/DETALLE\s+RESERVA/i);
  if (jetStart !== -1) {
    // Cortamos antes de regulaciones, si aparece
    const jetEndCandidates = [
      t.search(/INFORMACI[ÓO]N\s+DE\s+LA\s+AEROL[IÍ]NEA/i),
      t.search(/REGULACIONES/i),
      t.search(/Condiciones\s+generales/i),
      t.search(/Devoluciones/i),
    ].filter((x) => x !== -1);

    const jetEnd =
      jetEndCandidates.length > 0 ? Math.min(...jetEndCandidates) : Math.min(t.length, jetStart + 12000);

    return t.slice(Math.max(0, jetStart - 2000), jetEnd);
  }

  // Intento 2: Aerolíneas típico
  const aaStart = t.search(/C[óo]digo\s+de\s+Reserva/i);
  if (aaStart !== -1) {
    const aaEndCandidates = [
      t.search(/Condiciones/i),
      t.search(/T[ée]rminos/i),
      t.search(/Aerol[ií]neas\s+Plus/i),
    ].filter((x) => x !== -1);

    const aaEnd =
      aaEndCandidates.length > 0 ? Math.min(...aaEndCandidates) : Math.min(t.length, aaStart + 6000);

    return t.slice(Math.max(0, aaStart - 1500), aaEnd);
  }

  // Fallback: recortar a un tamaño razonable (evita que “se pierda” en texto infinito)
  if (t.length > 14000) return t.slice(0, 14000);
  return t;
}

function buildSystemInstruction({ hasPdf }) {
  const pdfInstruction = hasPdf
    ? `
DATOS DEL PDF ADJUNTO:
- Hay un PDF adjunto que puede contener el costo total o facturación.
- Priorizá el costo encontrado en el PDF si el email no desglosa por tramo.
`.trim()
    : "";

  return `
Eres un asistente de extracción de datos de vuelos.
Devuelve ÚNICAMENTE JSON válido (application/json).
NO markdown. NO texto adicional. NO explicación.

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
- NO inventes datos.
- bookingReference es obligatorio (ej: "QDVT6H", "OGPLLZ").
- Si no hay costo por tramo pero sí costo total, asignalo al primer vuelo y deja el segundo sin cost (o null).
- Si falta paymentMethod, dejarlo como "" o null.
- Si hay dos tramos, devolver dos objetos en flights.
`.trim();
}

async function callGemini({ apiKey, model, systemInstruction, emailText, pdfData }) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Recomendado: instrucciones separadas del contenido del usuario
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: emailText },
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
          // CLAVE: fuerza que el modelo devuelva JSON parseable
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const rawText = await resp.text();
  return { resp, rawText };
}

function extractCandidateText(wrapperValue) {
  const parts = wrapperValue?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  // Unimos todos los textos, por si viene fragmentado
  const joined = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("\n")
    .trim();

  return joined || null;
}

function parseModelOutputToJson(candidateText) {
  if (!candidateText) return { ok: false, error: new Error("empty candidateText") };

  // 1) Intento directo (si responseMimeType funciona, esto suele pasar)
  const direct = safeJsonParse(candidateText);
  if (direct.ok) return direct;

  // 2) Intento por extracción de { ... }
  const jsonBlock = extractFirstJsonObject(candidateText);
  if (!jsonBlock) {
    return { ok: false, error: new Error("No JSON object found") };
  }
  const extracted = safeJsonParse(jsonBlock);
  if (extracted.ok) return extracted;

  return { ok: false, error: extracted.error || new Error("Invalid extracted JSON") };
}

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "GOOGLE_API_KEY not set in Netlify env vars" });
  }

  // Diagnóstico opcional
  if (event.httpMethod === "GET" && event.queryStringParameters?.listModels === "1") {
    try {
      const { status, ok, text } = await listModels(apiKey);
      return jsonResponse(status, ok ? JSON.parse(text) : { error: text });
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

  const model = "gemini-2.5-flash";
  const sys = buildSystemInstruction({ hasPdf: !!pdfData });

  // Intento 1: email completo (pero con un recorte defensivo si es enorme)
  const primaryEmail = extractRelevantEmailSection(emailText);

  try {
    // --- Attempt #1 ---
    const { resp, rawText } = await callGemini({
      apiKey,
      model,
      systemInstruction: sys,
      emailText: primaryEmail,
      pdfData,
    });

    if (!resp.ok) {
      return jsonResponse(resp.status, {
        error: "Gemini API error",
        modelUsed: model,
        details: rawText.slice(0, 2000),
      });
    }

    const wrapper = safeJsonParse(rawText);
    if (!wrapper.ok) {
      return jsonResponse(502, {
        error: "Gemini wrapper is not valid JSON",
        details: rawText.slice(0, 800),
      });
    }

    const candidateText = extractCandidateText(wrapper.value);
    const parsedOut = parseModelOutputToJson(candidateText);

    // --- Retry #2 si falló ---
    if (!parsedOut.ok) {
      // Prompt aún más “duro” + recorte más agresivo (solo lo central)
      const retryEmail = extractRelevantEmailSection(primaryEmail);

      const strictSys = `${sys}

IMPORTANTE:
- Si el email contiene regulaciones, IGNORALAS.
- Concentrate SOLO en el itinerario / detalle de reserva.
- RESPONDE SOLO JSON.`;

      const r2 = await callGemini({
        apiKey,
        model,
        systemInstruction: strictSys,
        emailText: retryEmail,
        pdfData,
      });

      const raw2 = await r2.rawText;

      if (!r2.resp.ok) {
        return jsonResponse(r2.resp.status, {
          error: "Gemini API error (retry)",
          modelUsed: model,
          details: raw2.slice(0, 2000),
        });
      }

      const w2 = safeJsonParse(raw2);
      if (!w2.ok) {
        return jsonResponse(502, {
          error: "Gemini wrapper is not valid JSON (retry)",
          details: raw2.slice(0, 800),
        });
      }

      const ct2 = extractCandidateText(w2.value);
      const out2 = parseModelOutputToJson(ct2);

      if (!out2.ok) {
        return jsonResponse(502, {
          error: "No JSON object found in Gemini content",
          details: (ct2 || "").slice(0, 1200),
        });
      }

      return jsonResponse(200, out2.value);
    }

    return jsonResponse(200, parsedOut.value);
  } catch (err) {
    return jsonResponse(500, {
      error: "Function crashed",
      message: err?.message || String(err),
    });
  }
};
