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

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isAerolineasEmail(emailText) {
  var n = normalizeSearchText(emailText);
  return (
    n.indexOf("aerolineas argentinas") !== -1 &&
    n.indexOf("codigo de reserva") !== -1
  );
}

function parseSpanishFlightDate(text) {
  var months = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };

  var n = normalizeSearchText(text);
  var m = n.match(
    /(\d{1,2})(?:\s+de)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/i
  );
  if (!m) return null;

  var day = Number(m[1]);
  var month = months[m[2]];
  var year = m[3] ? Number(m[3]) : new Date().getFullYear();
  var d = new Date(year, month, day);

  if (!m[3]) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) d = new Date(year + 1, month, day);
  }

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

function toIsoLocal(datePart, timeText) {
  if (!datePart || !timeText) return null;

  var t = String(timeText).match(/(\d{1,2})[:.](\d{2})/);
  if (!t) return null;

  var yyyy = String(datePart.year).padStart(4, "0");
  var mm = String(datePart.month).padStart(2, "0");
  var dd = String(datePart.day).padStart(2, "0");
  var hh = String(Number(t[1])).padStart(2, "0");
  var min = String(Number(t[2])).padStart(2, "0");

  return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + min + ":00";
}

function cleanAirportCity(value) {
  return String(value || "")
    .replace(/\s*,?\s*(ARGENTINA|ARG)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAirport(value) {
  var s = String(value || "").trim();

  // Examples: "SLA - SALTA", "AEP - AEROPARQUE JORGE NEWBERY"
  var dashMatch = s.match(/\b([A-Z]{3})\s*[-–]\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,'-]+)/);
  if (dashMatch) {
    return {
      code: dashMatch[1].toUpperCase(),
      city: cleanAirportCity(dashMatch[2]),
    };
  }

  // Examples: "SALTA (SLA)", "AEROPARQUE JORGE NEWBERY (AEP)"
  var parenMatch = s.match(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,'-]+)\s*\(([A-Z]{3})\)/);
  if (parenMatch) {
    return {
      code: parenMatch[2].toUpperCase(),
      city: cleanAirportCity(parenMatch[1]),
    };
  }

  // Examples: "SLA SALTA, ARGENTINA", "AEP AEROPARQUE JORGE NEWBERY"
  var spaceMatch = s.match(/\b([A-Z]{3})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,'-]+)/);
  if (spaceMatch) {
    return {
      code: spaceMatch[1].toUpperCase(),
      city: cleanAirportCity(spaceMatch[2]),
    };
  }

  return null;
}

function parseAerolineasArgentinasEmail(emailText) {
  if (!isAerolineasEmail(emailText)) return null;

  var bookingMatch = emailText.match(
    /c[oó]digo\s+de\s+reserva\s*:?\s*([A-Z0-9]{5,8})/i
  );
  var bookingReference = bookingMatch ? bookingMatch[1].toUpperCase() : null;
  if (!bookingReference) return null;

  var flightMatches = [];
  var re = /\bAR\s*([0-9]{3,4})\b/gi;
  var match;

  while ((match = re.exec(emailText)) !== null) {
    flightMatches.push({ index: match.index, number: "AR" + match[1] });
  }

  if (flightMatches.length === 0) return null;

  var flights = [];

  for (var i = 0; i < flightMatches.length; i++) {
    var start = Math.max(0, flightMatches[i].index - 1200);
    var end =
      i + 1 < flightMatches.length
        ? flightMatches[i + 1].index
        : flightMatches[i].index + 2500;
    var block = emailText.slice(start, end);
    var datePart = parseSpanishFlightDate(block) || parseSpanishFlightDate(emailText);
    var lines = block
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);

    var depLine = lines.find(function (l) {
      return /salida|origen|desde/i.test(l) && parseAirport(l);
    });
    var arrLine = lines.find(function (l) {
      return /llegada|destino|hacia/i.test(l) && parseAirport(l);
    });

    var airports = lines.map(parseAirport).filter(Boolean);
    var dep = depLine ? parseAirport(depLine) : airports[0];
    var arr = arrLine ? parseAirport(arrLine) : airports[1];

    var times = block.match(/\b\d{1,2}[:.]\d{2}\b/g) || [];
    var depTime =
      depLine && depLine.match(/\b\d{1,2}[:.]\d{2}\b/)
        ? depLine.match(/\b\d{1,2}[:.]\d{2}\b/)[0]
        : times[0];
    var arrTime =
      arrLine && arrLine.match(/\b\d{1,2}[:.]\d{2}\b/)
        ? arrLine.match(/\b\d{1,2}[:.]\d{2}\b/)[0]
        : times[1];

    var departureDateTime = toIsoLocal(datePart, depTime);
    var arrivalDateTime = toIsoLocal(datePart, arrTime);

    if (departureDateTime && arrivalDateTime && arrivalDateTime < departureDateTime) {
      var arrival = new Date(arrivalDateTime);
      arrival.setDate(arrival.getDate() + 1);
      arrivalDateTime = arrival.toISOString().slice(0, 19);
    }

    if (dep && arr && departureDateTime) {
      flights.push({
        flightNumber: flightMatches[i].number,
        airline: "Aerolíneas Argentinas",
        departureAirportCode: dep.code,
        departureCity: dep.city,
        arrivalAirportCode: arr.code,
        arrivalCity: arr.city,
        departureDateTime: departureDateTime,
        arrivalDateTime: arrivalDateTime,
        cost: null,
        paymentMethod: null,
        bookingReference: bookingReference,
      });
    }
  }

  if (flights.length === 0) return null;

  return {
    flights: flights,
    purchaseDate: flights[0].departureDateTime || new Date().toISOString(),
  };
}

function normalizeMoneyValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  var cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  var n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractAerolineasPdfPaymentData(value) {
  if (!value || typeof value !== "object") return { cost: null, paymentMethod: null };

  var cost =
    normalizeMoneyValue(value.cost) ||
    normalizeMoneyValue(value.totalCost) ||
    normalizeMoneyValue(value.total) ||
    normalizeMoneyValue(value.amount);

  var paymentMethod =
    typeof value.paymentMethod === "string" && value.paymentMethod.trim()
      ? value.paymentMethod.trim()
      : typeof value.payment_method === "string" && value.payment_method.trim()
      ? value.payment_method.trim()
      : typeof value.formaDePago === "string" && value.formaDePago.trim()
      ? value.formaDePago.trim()
      : null;

  if ((!cost || !paymentMethod) && Array.isArray(value.flights) && value.flights[0]) {
    var firstFlight = value.flights[0];
    if (!cost) cost = normalizeMoneyValue(firstFlight.cost);
    if (
      !paymentMethod &&
      typeof firstFlight.paymentMethod === "string" &&
      firstFlight.paymentMethod.trim()
    ) {
      paymentMethod = firstFlight.paymentMethod.trim();
    }
  }

  return {
    cost: cost || null,
    paymentMethod: paymentMethod || null,
  };
}

function buildAerolineasPdfPaymentInstruction() {
  return (
    "Eres un asistente de extraccion de datos de facturacion de vuelos.\n" +
    "Usa principalmente el PDF adjunto.\n" +
    "Devuelve UNICAMENTE JSON valido. NO markdown. NO explicacion.\n\n" +
    "ESQUEMA:\n" +
    "{\n" +
    '  "cost": number | null,\n' +
    '  "paymentMethod": "string" | null\n' +
    "}\n\n" +
    "REGLAS:\n" +
    "- Extrae el costo total pagado si aparece.\n" +
    "- Extrae la forma de pago con el mayor detalle disponible.\n" +
    "- Si el PDF menciona tarjeta, marca, banco, billetera, ultimos digitos o medio de pago, conserva ese texto resumido.\n" +
    "- Ejemplos validos: \"Visa ****1234\", \"Mastercard\", \"Debito Nacion\", \"Mercado Pago\".\n" +
    "- No devuelvas solamente \"tarjeta\" si hay mas detalle disponible.\n" +
    "- Si no encuentras un dato, devuelvelo como null.\n"
  );
}

async function enrichAerolineasWithPdfPayment(params) {
  var parsed = params.parsed;
  var apiKey = params.apiKey;
  var model = params.model;
  var emailText = params.emailText;
  var pdfData = params.pdfData;

  if (!parsed || !pdfData || !apiKey) return parsed;

  try {
    var r = await callGemini({
      apiKey: apiKey,
      model: model,
      systemInstruction: buildAerolineasPdfPaymentInstruction(),
      emailText:
        "Email de Aerolineas Argentinas ya parseado deterministicamente.\n" +
        "Solo intenta extraer costo total y forma de pago desde el PDF.\n\n" +
        emailText,
      pdfData: pdfData,
    });

    if (!r.resp.ok) return parsed;

    var wrapper = safeJsonParse(r.rawText);
    if (!wrapper.ok) return parsed;

    var candidateText = extractCandidateText(wrapper.value);
    var output = parseModelOutputToJson(candidateText);
    if (!output.ok) return parsed;

    var paymentData = extractAerolineasPdfPaymentData(output.value);
    if (!paymentData.cost && !paymentData.paymentMethod) return parsed;

    return {
      purchaseDate: parsed.purchaseDate,
      flights: parsed.flights.map(function (flight, index) {
        return {
          ...flight,
          cost: index === 0 && paymentData.cost ? paymentData.cost : flight.cost,
          paymentMethod: paymentData.paymentMethod || flight.paymentMethod,
        };
      }),
    };
  } catch (e) {
    return parsed;
  }
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
    var afterJetStart = t.slice(jetStart);
    var a = afterJetStart.search(/INFORMACI[ÓO]N\s+DE\s+LA\s+AEROL[IÍ]NEA/i);
    var b = afterJetStart.search(/REGULACIONES/i);
    var c = afterJetStart.search(/Condiciones\s+Generales/i);
    var d = afterJetStart.search(/Devoluciones/i);

    if (a > 0) candidates.push(jetStart + a);
    if (b > 0) candidates.push(jetStart + b);
    if (c > 0) candidates.push(jetStart + c);
    if (d > 0) candidates.push(jetStart + d);

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

function stripMarkdownJsonFence(text) {
  if (typeof text !== "string") return "";
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function removeTrailingJsonCommas(text) {
  return String(text || "").replace(/,\s*([}\]])/g, "$1");
}

function parseModelOutputToJson(candidateText) {
  if (!candidateText) return { ok: false, error: new Error("empty candidateText") };

  var cleaned = stripMarkdownJsonFence(candidateText);

  // Try direct JSON first
  var direct = safeJsonParse(cleaned);
  if (direct.ok) return direct;

  var noTrailingCommas = removeTrailingJsonCommas(cleaned);
  var directNoTrailingCommas = safeJsonParse(noTrailingCommas);
  if (directNoTrailingCommas.ok) return directNoTrailingCommas;

  // Extract {...} block and parse
  var jsonBlock = extractFirstJsonObject(noTrailingCommas);
  if (!jsonBlock) {
    return {
      ok: false,
      error: directNoTrailingCommas.error || direct.error || new Error("No JSON object found"),
    };
  }

  var extracted = safeJsonParse(jsonBlock);
  if (extracted.ok) return extracted;

  var extractedNoTrailingCommas = safeJsonParse(removeTrailingJsonCommas(jsonBlock));
  if (extractedNoTrailingCommas.ok) return extractedNoTrailingCommas;

  return {
    ok: false,
    error:
      extractedNoTrailingCommas.error ||
      extracted.error ||
      directNoTrailingCommas.error ||
      direct.error ||
      new Error("Invalid extracted JSON"),
  };
}

exports.handler = async function (event) {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  var apiKey = process.env.GOOGLE_API_KEY;

  // Optional diagnostics
  if (event.httpMethod === "GET") {
    var qs = event.queryStringParameters || {};
    if (qs.listModels === "1") {
      if (!apiKey) {
        return jsonResponse(500, {
          error: "GOOGLE_API_KEY not set in Netlify env vars",
        });
      }

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

  var aerolineasParsed = parseAerolineasArgentinasEmail(emailText);
  if (aerolineasParsed) {
    if (pdfData && apiKey) {
      var aerolineasWithPayment = await enrichAerolineasWithPdfPayment({
        parsed: aerolineasParsed,
        apiKey: apiKey,
        model: "gemini-2.5-flash",
        emailText: emailText,
        pdfData: pdfData,
      });
      return jsonResponse(200, aerolineasWithPayment);
    }

    return jsonResponse(200, aerolineasParsed);
  }

  if (!apiKey) {
    return jsonResponse(500, {
      error: "GOOGLE_API_KEY not set in Netlify env vars",
    });
  }

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
        var finishReason =
          w2.value &&
          w2.value.candidates &&
          w2.value.candidates[0] &&
          w2.value.candidates[0].finishReason
            ? w2.value.candidates[0].finishReason
            : null;
        var ct2Length = ct2 ? ct2.length : 0;

        return jsonResponse(502, {
          error: "No JSON object found in Gemini content",
          parseError: out2.error ? out2.error.message : null,
          finishReason: finishReason,
          candidateTextLength: ct2Length,
          details: (ct2 || "").slice(0, 1200),
          detailsTail: (ct2 || "").slice(Math.max(0, ct2Length - 500)),
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
