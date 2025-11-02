import { GoogleGenAI, Type, Part } from "@google/genai";
import type { Flight } from '../types';

const flightSchema = {
  type: Type.OBJECT,
  properties: {
    flightNumber: { type: Type.STRING, description: "Número de vuelo, por ejemplo 'AR1450'." },
    airline: { type: Type.STRING, description: "Nombre de la aerolínea, por ejemplo 'Aerolineas Argentinas'." },
    departureAirportCode: { type: Type.STRING, description: "Código IATA del aeropuerto de salida, ej. 'SLA'." },
    departureCity: { type: Type.STRING, description: "Ciudad de salida, ej. 'Salta'." },
    arrivalAirportCode: { type: Type.STRING, description: "Código IATA del aeropuerto de llegada, ej. 'AEP', 'EZE'." },
    arrivalCity: { type: Type.STRING, description: "Ciudad de llegada, ej. 'Buenos Aires'." },
    departureDateTime: { type: Type.STRING, description: "Fecha y hora de salida en formato ISO 8601 'YYYY-MM-DDTHH:mm:ss'." },
    arrivalDateTime: { type: Type.STRING, description: "Fecha y hora de llegada en formato ISO 8601 'YYYY-MM-DDTHH:mm:ss'." },
    cost: { type: Type.NUMBER, description: "Costo asociado a este vuelo específico. Si el correo desglosa el costo por tramo, extrae el costo para este vuelo. Si solo se muestra un costo total, asígnalo al primer vuelo de la lista." },
    paymentMethod: { type: Type.STRING, description: "Método de pago para este vuelo, ej. 'Tarjeta de Crédito terminada en 1234'." },
    bookingReference: { type: Type.STRING, description: "Código de reserva o localizador (PNR) para ESTE TRAMO específico." },
  },
  required: ["flightNumber", "departureAirportCode", "arrivalAirportCode", "departureDateTime", "arrivalDateTime", "bookingReference"]
};

const emailSchema = {
  type: Type.OBJECT,
  properties: {
    flights: {
      type: Type.ARRAY,
      description: "Una lista de CADA VUELO individual encontrado en el email. Si es un solo tramo, esta lista tendrá un solo elemento. Si es ida y vuelta, tendrá dos. Cada elemento debe ser un objeto de vuelo completo.",
      items: flightSchema,
    },
    purchaseDate: { type: Type.STRING, description: "La fecha de COMPRA o EMISIÓN del viaje, extraída del correo. Busca frases como 'Fecha de compra' o 'Emitido el'. Debe estar en formato ISO 8601 'YYYY-MM-DDTHH:mm:ss'. Si no se encuentra explícitamente, usa la fecha de salida del primer vuelo como fallback." },
  },
  required: ["flights", "purchaseDate"]
};

interface GeminiResponse {
  flights: Flight[];
  purchaseDate: string;
}

export const parseFlightEmail = async (apiKey: string, emailText: string, pdfBase64?: string | null): Promise<GeminiResponse> => {
  if (!apiKey) {
    throw new Error("An API Key must be set when running in a browser");
  }

  const pdfInstruction = pdfBase64 
    ? `
    DATOS DEL PDF ADJUNTO:
    - Se ha adjuntado un archivo PDF. Este archivo puede contener la información de facturación y el costo total del viaje.
    - DEBES priorizar el valor encontrado en el PDF como el 'cost' si el correo no desglosa los costos por tramo.
    `
    : '';
    
  const instructions = `
    Eres un asistente experto en extracción de datos de vuelos. Tu única función es convertir los detalles de un email de vuelo a formato JSON según el esquema provisto.
    ${pdfInstruction}

    REGLAS ESTRICTAS E INQUEBRABLES:
    1.  TAREA PRINCIPAL: Extrae CADA VUELO que encuentres en el email y colócalo como un objeto individual dentro de la lista 'flights' del JSON.
    2.  CÓDIGO DE RESERVA (PNR) ES CLAVE: Para CADA vuelo, DEBES extraer su propio 'bookingReference'. Es el dato más importante.
    3.  REGLA DE ORO: NO INVENTES VUELOS. Si el email contiene solo UN vuelo, la lista 'flights' DEBE contener solo UN objeto. Si contiene dos, la lista debe contener DOS objetos.
    4.  COSTO: Busca el costo para CADA VUELO individualmente. Si el correo desglosa el precio por tramo (ej. "Vuelo de ida: $..."), asigna el costo correspondiente a cada vuelo. Si SOLO se muestra un costo TOTAL para todo el viaje, asigna ese costo total al campo 'cost' del PRIMER vuelo en la lista 'flights' y deja el resto en null.
    5.  FECHA DE COMPRA (purchaseDate): Este campo es CRÍTICO. Debes encontrar la fecha en que se realizó la compra o se emitió la confirmación. Busca atentamente frases como "Fecha de compra:", "Fecha de emisión:", "Emitido el:". Si después de una búsqueda exhaustiva no encuentras una fecha de compra explícita, DEBES usar la fecha de salida del primer vuelo listado como el valor para 'purchaseDate'.

    FORMATO DE FECHA:
    - Debes convertir SIEMPRE las fechas y horas al formato estricto ISO 8601: 'YYYY-MM-DDTHH:mm:ss'.
    - Si el año no está especificado (ej. '21 oct'), deduce el año futuro más próximo. Si la fecha actual es Junio 2024 y la fecha del vuelo es '21 oct', el año es 2024. Si la fecha actual es Diciembre 2024 y la fecha del vuelo es '21 oct', el año correcto es 2025.
  `;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const parts: Part[] = [
      { text: instructions },
      { text: `Texto del correo a analizar:\n---\n${emailText}\n---` }
    ];
    
    if (pdfBase64) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: emailSchema,
      },
    });

    const parsedText = response.text.trim();
    const aiResponse = JSON.parse(parsedText) as GeminiResponse;
    
    if (!aiResponse.flights || aiResponse.flights.length === 0) {
      throw new Error("La IA no pudo encontrar ningún vuelo en el texto proporcionado.");
    }
    
    return aiResponse;
    
  } catch (error: any) {
    console.error('Error procesando el email con Gemini:', error);
    if (error.message.includes('API key not valid')) {
      throw new Error('La API Key no es válida o ha expirado. Por favor, verifica tu clave.');
    }
    throw new Error(`Error de la IA: ${error.message || 'No se pudo procesar el correo.'}`);
  }
};