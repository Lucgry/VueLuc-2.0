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
    cost: { type: Type.NUMBER, description: "Costo asociado a este vuelo específico. Si el costo es para el viaje completo, asígnalo al primer vuelo." },
    paymentMethod: { type: Type.STRING, description: "Método de pago para este vuelo, ej. 'Tarjeta de Crédito terminada en 1234'." },
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
    bookingReference: { type: Type.STRING, description: "Código de reserva o localizador." },
  },
  required: ["bookingReference", "flights"]
};

export const parseFlightEmail = async (apiKey: string, emailText: string, pdfBase64?: string | null): Promise<Omit<Trip, 'id' | 'createdAt'>> => {
  if (!apiKey) {
    throw new Error("An API Key must be set when running in a browser");
  }

  const pdfInstruction = pdfBase64 
    ? `
    DATOS DEL PDF ADJUNTO:
    - Se ha adjuntado un archivo PDF. Este archivo contiene la información de facturación y el costo total del viaje.
    - DEBES priorizar el valor encontrado en el PDF como el 'cost' y asignarlo al primer vuelo de la lista.
    `
    : '';
    
  const instructions = `
    Eres un asistente de extracción de datos de vuelos. Tu única función es convertir los detalles de un email de vuelo a formato JSON según el esquema provisto.
    ${pdfInstruction}

    REGLAS ESTRICTAS E INQUEBRABLES:
    1.  TAREA PRINCIPAL: Extrae CADA VUELO que encuentres en el email y colócalo como un objeto dentro de la lista 'flights' del JSON.
    2.  REGLA DE ORO: NO INVENTES VUELOS. Si el email contiene solo UN vuelo, la lista 'flights' DEBE contener solo UN objeto. Si el email contiene dos vuelos (ida y vuelta), la lista 'flights' debe contener DOS objetos.
    3.  COSTO: El costo total del viaje debe ser asignado al campo 'cost' del PRIMER vuelo en la lista 'flights'.

    FORMATO DE FECHA:
    - Debes convertir SIEMPRE las fechas y horas al formato estricto ISO 8601: 'YYYY-MM-DDTHH:mm:ss'.
    - Si el año no está especificado (ej. '21 oct'), deduce el año futuro más próximo. Si la fecha actual es Junio 2025 y la fecha del vuelo es '21 oct', el año es 2025. Si la fecha actual es Diciembre 2025 y la fecha del vuelo es '21 oct', el año correcto es 2026.

    Extrae también el 'bookingReference'.
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
        responseSchema: tripSchema,
      },
    });

    const parsedText = response.text.trim();
    
    type GeminiResponse = {
      flights: Flight[];
      bookingReference: string | null;
    };

    const aiResponse = JSON.parse(parsedText) as GeminiResponse;
    
    const finalTrip: Omit<Trip, 'id' | 'createdAt'> = {
      departureFlight: null,
      returnFlight: null,
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
        if (!finalTrip.departureFlight) {
          finalTrip.departureFlight = flight;
        }
      } else if (BUENOS_AIRES_CODES.includes(departureCode)) {
        if (!finalTrip.returnFlight) {
          finalTrip.returnFlight = flight;
        }
      }
    }
    
    return finalTrip;

  } catch (error) {
    console.error("Error parsing flight email with Gemini:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred during parsing.";
    if (message.includes('API key not valid') || message.includes('API key is invalid') || message.includes('API key is forbidden') || message.includes('403') || message.includes('Requested entity was not found')) {
        throw new Error("La API Key no es válida.");
    }
    if (message.includes('An API Key must be set')) {
        throw new Error(message);
    }
    if (message.includes('JSON')) {
        throw new Error("La IA no pudo procesar el email. Asegúrate de que el texto copiado sea claro y contenga los detalles del vuelo.");
    }

    throw new Error(`Error al procesar el email: ${message}`);
  }
};