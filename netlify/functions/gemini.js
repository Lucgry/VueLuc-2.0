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

export async function handler(event) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GOOGLE_API_KEY not set in Netlify env vars" }),
      };
    }

    const { emailText, pdfBase64 } = JSON.parse(event.body || "{}");
    if (!emailText || typeof emailText !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "emailText is required" }) };
    }

    const pdfInstruction = pdfBase64
      ? `
DATOS DEL PDF ADJUNTO:
- Hay un PDF adjunto que puede contener el costo total o facturación.
- Priorizá el costo encontrado en el PDF si el email no desglosa por tramo.
`
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

    const ai = new GoogleGenAI({ apiKey });

    const parts = [
      { text: instructions },
      { text: `Texto del correo a analizar:\n---\n${emailText}\n---` },
    ];

    if (pdfBase64) {
      parts.push({
        inlineData: { mimeType: "application/pdf", data: pdfBase64 },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: tripSchema,
      },
    });

    const parsedText = (response.text || "").trim();
    const json = JSON.parse(parsedText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || String(err) }),
    };
  }
}
