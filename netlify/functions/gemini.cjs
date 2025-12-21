/* netlify/functions/gemini.cjs */
"use strict";

/** Helper: JSON response with CORS */
function jsonResponse(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
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

/** Extract the first valid {...} JSON object from a text */
function extractFirstJsonObject(text) {
  if (typeof text !== "string") return null;

  var cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  var firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;

  var depth = 0;
  for (var i = firstBrace; i < cleaned.length; i++) {
    var ch = cleaned[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      return cleaned.slice(firstBrace, i + 1);
    }
  }
  return null;
}

async function listModels(apiKey) {
  var resp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey
  );
  var text = await resp.text();
  return { status: resp.status, ok: resp.ok, text: text };
}

/**
 * Heuristic: cut the email to the relevant itinerary/reservation section.
 * JetSMART emails can be extremely long due to legal/regulations blocks.
 */
function extractRelevantEmailSection(emailText) {
  if (typeof emailText !== "string") return "";

  var t = emailText;

  // JetSMART typical
  var jetStart = t.search(/DETALLE\s+RESERVA/i);
  if (jetStart !== -1) {
    var candidates = [];
    var a = t.search(/INFORMACI[ÓO]N\s+DE\s+LA\s+AEROL[IÍ]NEA/i);
    var b = t.search(/REGULACIONES/i);
    var c = t.search(/Condiciones\s+Generales/i);
    var d = t.search(/Devoluciones/i);

    if (a !== -1) candidates.push(a);
    if (b !== -1) candidates.push(b);
    if (c !== -1) candidates.push(c);
    if (d !== -1) candidates.push(d);

    var jetEnd = t.length;
    if (candidates.length > 0) {
      jetEnd = Math.min.apply(null, candidates);
    } else {
      jetEnd = Math.min(t.length, jetStart + 12000);
    }

    var from = Math.max(0, jetStart - 2000);
    return t.slice(from, jetEnd);
  }

  // Aerolineas typical
  var aaStart = t.search(/C[óo]digo\s+de\s+Reserva/i);
  if (aaStart !== -1) {
    var candidates2 = [];
    var e = t.search(/Condiciones/i);
    var f = t.search(/T[ée]rminos/i);
    var g = t.search(/Aerol[ií]neas\s+Plus/i);

    if (e !== -1) candidates2.push(e);
    if (f !== -1) candidates2.push(f);
    if (g !== -1) candidates2.push(g);

    var aaEnd = t.length;
    if (candidates2.length > 0) {
      aaEnd = Math.min.apply(null, candidates2);
    } else {
      aaEnd = Math.min(t.length, aaStart + 6000);
    }

    var from2 = Math.max(0, aaStart - 1500);
    return t.slice(from2, aaEnd);
  }

  // Fallback: hard cap to avoid huge payloads
  if (t.length > 14000) return t.slice(0, 14000);
  return t;
}

function buildSystemInstruction(hasPdf) {
  var pdfInstruction = "";
  if (hasPdf) {
    pdfInstruction =
      "DATOS DEL PDF ADJUNTO:\n" +
      "- Hay un PDF adjunto que puede contener el costo total o facturacion.\n" +
      "- Prioriza el costo encontrado en el PDF si el email no desglosa por tramo.\n";
  }

  return (
    "Eres un asistente de extraccion de datos de vuelos.\n" +
    "Devuelve UNICAMENTE JSON valido (application/json).\n" +
    "NO markdown. NO texto adicional. NO explicacion.\n\n" +
    pdfInstruction +
    "\nESQUEMA:\n" +
    "{\n" +
    '  \"flights\": [\n' +
    "    {\n" +
    '      \"flightNumber\": \"string\",\n' +
    '      \"airline\": \"string\",\n' +
    '      \"departureAirportCode\": \"string\",\n' +
    '      \"departureCity\": \"string\",\n' +
    '      \"arrivalAirportCode\": \"string\",\n' +
    '      \"arrivalCity\": \"string\",\n' +
    '      \"departureDateTime\": \"YYYY-MM-DDTHH:mm:ss\",\n' +
    '      \"arrivalDateTime\": \"YYYY-MM-DDTHH:mm:ss\",\n' +
    '      \"cost\": number,\n' +
    '      \"paymentMethod\": \"string\",\n' +
    '      \"bookingReference\": \"string\"\n' +
    "    }\n" +
    "  ],\n" +
    '  \"purchaseDate\": \"YYYY-MM-DDTHH:mm:ss\"\n' +
    "}\n\n" +
    "REGLAS:\n" +
    "- NO inventes datos.\n" +
    "- bookingReference es obligatorio (ej: QDVT6H, OGPLLZ).\n" +
    "- Extraer TODOS los tramos como objetos en flights.\n" +
    "- Si hay dos tramos, devolver dos objetos en flights.\n" +
    "- Los meses/días pueden venir en español (ej: 'lunes, 22 diciembre').\n" +
    "- Si la fecha de un vuelo NO incluye año, inferilo usando la 'FECHA DE REFERENCIA DEL EMAIL' si aparece en el texto.\n" +
    "- Manejar cruces de medianoche: si arrivalHour < departureHour y NO hay fecha explícita de llegada, sumar 1 día a la fecha de llegada.\n" +
    "- Si no hay costo por tramo pero si costo total, asignalo al primer vuelo y deja el segundo sin cost (o null).\n" +
    "- Si falta paymentMethod, dejarlo como \"\" o null.\n"
  );
}

async function callGemini(params) {
  var apiKey = params.apiKey;
  var model = params.model;
  var systemInstruction = params.systemInstruction;
  var emailText = params.emailText;
  var pdfData = params.pdfData;

  var url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent?key=" +
    apiKey;

  var parts = [{ text: emailText }];
  if (pdfData) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfData,
      },
    });
  }

  var body = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  };

  var resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  var rawText = await resp.text();
  return { resp: resp, rawText: rawText };
}

function extractCandidateText(wrapperValue) {
  var cand = wrapperValue && wrapperValue.candidates && wrapperValue.candidates[0];
  var content = cand && cand.content;
  var parts = content && content.parts;

  if (!Array.isArray(parts) || parts.length === 0) return null;

  var joined = parts
    .map(function (p) {
      return typeof p.text === "string" ? p.text : "";
    })
    .join("\n")
    .trim();

  return joined ? joined : null;
}

function parseModelOutputToJson(candidateText) {
  if (!candidateText) return { ok: false, error: new Error("empty candidateText") };

  // Try direct JSON first
  var direct = safeJsonParse(candidateText);
  if (direct.ok) return direct;

  // Extract {...} block and parse
  var jsonBlock = extractFirstJsonObject(candidateText);
  if (!jsonBlock) {
    return { ok: false, error: new Error("No JSON object found") };
  }

  var extracted = safeJsonParse(jsonBlock);
  if (extracted.ok) return extracted;

  return { ok: false, error: extracted.error || new Error("Invalid extracted JSON") };
}

exports.handler = async function (event) {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  var apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "GOOGLE_API_KEY not set in Netlify env vars",
    });
  }

  // Optional diagnostics
  if (event.httpMethod === "GET") {
    var qs = event.queryStringParameters || {};
    if (qs.listModels === "1") {
      try {
        var lm = await listModels(apiKey);
        if (lm.ok) {
          return jsonResponse(lm.status, JSON.parse(lm.text));
        }
        return jsonResponse(lm.status, { error: lm.text });
      } catch (e) {
        return jsonResponse(500, {
          error: "ListModels failed",
          message: (e && e.message) || String(e),
        });
      }
    }
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed. Use POST." });
  }

  var parsed = safeJsonParse(event.body || "{}");
  if (!parsed.ok) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  var emailText = parsed.value.emailText;
  var pdfBase64 = parsed.value.pdfBase64;

  if (!emailText || typeof emailText !== "string" || !emailText.trim()) {
    return jsonResponse(400, { error: "emailText is required" });
  }

  var pdfData =
    typeof pdfBase64 === "string" && pdfBase64.trim() ? pdfBase64.trim() : null;

  var model = "gemini-2.5-flash";
  var sys = buildSystemInstruction(!!pdfData);
  var primaryEmail = extractRelevantEmailSection(emailText);

  try {
    // Attempt #1
    var r1 = await callGemini({
      apiKey: apiKey,
      model: model,
      systemInstruction: sys,
      emailText: primaryEmail,
      pdfData: pdfData,
    });

    if (!r1.resp.ok) {
      return jsonResponse(r1.resp.status, {
        error: "Gemini API error",
        modelUsed: model,
        details: r1.rawText.slice(0, 2000),
      });
    }

    var w1 = safeJsonParse(r1.rawText);
    if (!w1.ok) {
      return jsonResponse(502, {
        error: "Gemini wrapper is not valid JSON",
        details: r1.rawText.slice(0, 800),
      });
    }

    var ct1 = extractCandidateText(w1.value);
    var out1 = parseModelOutputToJson(ct1);

    // Retry #2 if parsing failed
    if (!out1.ok) {
      var strictSys =
        sys +
        "\nIMPORTANTE:\n" +
        "- Si el email contiene regulaciones, IGNORALAS.\n" +
        "- Concentrate SOLO en el itinerario / detalle de reserva.\n" +
        "- RESPONDE SOLO JSON.\n";

      var r2 = await callGemini({
        apiKey: apiKey,
        model: model,
        systemInstruction: strictSys,
        emailText: primaryEmail,
        pdfData: pdfData,
      });

      if (!r2.resp.ok) {
        return jsonResponse(r2.resp.status, {
          error: "Gemini API error (retry)",
          modelUsed: model,
          details: r2.rawText.slice(0, 2000),
        });
      }

      var w2 = safeJsonParse(r2.rawText);
      if (!w2.ok) {
        return jsonResponse(502, {
          error: "Gemini wrapper is not valid JSON (retry)",
          details: r2.rawText.slice(0, 800),
        });
      }

      var ct2 = extractCandidateText(w2.value);
      var out2 = parseModelOutputToJson(ct2);

      if (!out2.ok) {
        return jsonResponse(502, {
          error: "No JSON object found in Gemini content",
          details: (ct2 || "").slice(0, 1200),
        });
      }

      return jsonResponse(200, out2.value);
    }

    return jsonResponse(200, out1.value);
  } catch (err) {
    return jsonResponse(500, {
      error: "Function crashed",
      message: (err && err.message) || String(err),
    });
  }
};
