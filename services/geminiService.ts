import { GoogleGenAI, Type, Part } from "@google/genai";
import type { Trip, Flight } from '../types';

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
  },
  required: ["flightNumber", "departureAirportCode", "arrivalAirportCode", "departureDateTime", "arrivalDateTime"]
};


const tripSchema = {
  type: Type.OBJECT,
  properties: {
    flights: {
      type: Type.ARRAY,
      description: "Una lista de todos los vuelos encontrados en el email. Si es un solo tramo, esta lista tendrá un solo elemento. Si es ida y vuelta, tendrá dos.",
      items: flightSchema,
    },
    totalCost: { type: Type.NUMBER, description: "Costo total del viaje como un número, sin símbolos de moneda." },
    paymentMethod: { type: Type.STRING, description: "Método de pago, por ejemplo 'Tarjeta de Crédito terminada en 1234'." },
    bookingReference: { type: Type.STRING, description: "Código de reserva o localizador." },
  },
  required: ["bookingReference", "flights"]
};

export const parseFlightEmail = async (emailText: string, pdfBase64?: string | null): Promise<Omit<Trip, 'id' | 'createdAt'>> => {
  const pdfInstruction = pdfBase64 
    ? `
    DATOS DEL PDF ADJUNTO:
    - Se ha adjuntado un archivo PDF. Este archivo contiene la información de facturación y el costo total del viaje.
    - DEBES priorizar el valor encontrado en el PDF como el 'totalCost'. Si el texto del email también menciona un precio, ignóralo y usa únicamente el del PDF.
    `
    : '';
    
  const instructions = `
    Eres un asistente de extracción de datos de vuelos. Tu única función es convertir los detalles de un email de vuelo a formato JSON según el esquema provisto.
    ${pdfInstruction}

    REGLAS ESTRICTAS E INQUEBRABLES:
    1.  TU ÚNICA FUENTE DE VERDAD es la sección del email titulada "DETALLE RESERVA" o similar. Ignora por completo cualquier otra parte del texto.
    2.  TAREA PRINCIPAL: Extrae CADA VUELO que encuentres en la sección "DETALLE RESERVA" y colócalo como un objeto dentro de la lista 'flights' del JSON.
    3.  REGLA DE ORO: NO INVENTES VUELOS. Si el email contiene solo UN vuelo, la lista 'flights' DEBE contener solo UN objeto. Si el email contiene dos vuelos (ida y vuelta), la lista 'flights' debe contener DOS objetos. Tu trabajo es reportar literalmente lo que está escrito en la sección "DETALLE RESERVA".

    FORMATO DE FECHA:
    - Debes convertir SIEMPRE las fechas y horas al formato estricto ISO 8601: 'YYYY-MM-DDTHH:mm:ss'.
    - Si el año no está especificado (ej. '21 oct'), deduce el año futuro más próximo. Si la fecha actual es Junio 2025 y la fecha del vuelo es '21 oct', el año es 2025. Si la fecha actual es Diciembre 2025 y la fecha del vuelo es '21 oct', el año correcto es 2026.

    Extrae también el 'bookingReference' y el 'totalCost', priorizando el costo del PDF si se adjunta.
  `;

  try {
    // FIX: Initialize the AI client here, inside the try/catch block.
    // This prevents the app from crashing on startup if the API key is not immediately available.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("La clave de API no está configurada. No se puede comunicar con el servicio de IA.");
    }
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
        responseSchema: tripSchema,
      },
    });

    const parsedText = response.text.trim();
    
    type GeminiResponse = {
      flights: Flight[];
      totalCost: number | null;
      paymentMethod: string | null;
      bookingReference: string | null;
    };

    const aiResponse = JSON.parse(parsedText) as GeminiResponse;
    
    // --- AUTHORITATIVE CLASSIFICATION LOGIC ---
    // This logic takes the list of flights from the AI and classifies them correctly,
    // preventing any hallucinated data from persisting.
    
    const finalTrip: Omit<Trip, 'id' | 'createdAt'> = {
      departureFlight: null,
      returnFlight: null,
      totalCost: aiResponse.totalCost,
      paymentMethod: aiResponse.paymentMethod,
      bookingReference: aiResponse.bookingReference,
    };

    const BUENOS_AIRES_CODES = ['AEP', 'EZE'];
    const SALTA_CODE = 'SLA';

    const isFlightValid = (flight: any): flight is Flight => {
      return flight &&
             typeof flight.departureAirportCode === 'string' &&
             typeof flight.departureDateTime === 'string' &&
             !isNaN(new Date(flight.departureDateTime).getTime());
    };

    for (const flight of aiResponse.flights) {
      if (!isFlightValid(flight)) {
        continue;
      }

      const departureCode = flight.departureAirportCode.toUpperCase().trim();
      
      if (departureCode === SALTA_CODE) {
        // Rule: A flight FROM Salta is ALWAYS an "Ida" (departureFlight).
        if (!finalTrip.departureFlight) {
          finalTrip.departureFlight = flight;
        }
      } else if (BUENOS_AIRES_CODES.includes(departureCode)) {
        // Rule: A flight FROM Buenos Aires is ALWAYS a "Vuelta" (returnFlight).
        if (!finalTrip.returnFlight) {
          finalTrip.returnFlight = flight;
        }
      }
    }
    
    return finalTrip;

  } catch (error) {
    console.error("Error parsing flight email with Gemini:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred during parsing.";
    if (message.includes('JSON')) {
        throw new Error("La IA no pudo procesar el email. Asegúrate de que el texto copiado sea claro y contenga los detalles del vuelo.");
    }
    if (message.includes("API")) {
        throw new Error(`Error de configuración: ${message}`);
    }
    throw new Error(`Error al procesar el email: ${message}`);
  }
};