// services/geminiService.ts
import type { Trip, Flight } from "../types";

// Nota: el schema e instrucciones ya NO viven en el frontend.
// Se ejecutan en la Netlify Function (server-side) para no exponer lógica sensible ni API keys.

type GeminiResponse = {
  flights: Flight[];
  purchaseDate: string;
};

export const parseFlightEmail = async (
  _apiKey: string, // se mantiene por compatibilidad (no se usa). El frontend NO maneja claves.
  emailText: string,
  pdfBase64?: string | null
): Promise<Omit<Trip, "id" | "createdAt">> => {
  if (!emailText || typeof emailText !== "string") {
    throw new Error("El texto del correo (emailText) es obligatorio.");
  }

  try {
    // Llamada segura: el servidor (Netlify Function) tiene GOOGLE_API_KEY en variables de entorno.
    const res = await fetch("/.netlify/functions/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailText,
        pdfBase64: pdfBase64 || null,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // La function debería responder { error: "..." } ante fallos
      const msg = data?.error || `Error llamando a Gemini (status ${res.status})`;
      throw new Error(msg);
    }

    const aiResponse = data as GeminiResponse;

    // Validación mínima defensiva
    if (!aiResponse || !Array.isArray(aiResponse.flights)) {
      throw new Error("Respuesta inválida de la IA: falta 'flights'.");
    }
    if (!aiResponse.purchaseDate) {
      throw new Error("Respuesta inválida de la IA: falta 'purchaseDate'.");
    }

    const initialTrip: Omit<Trip, "id" | "createdAt"> = {
      departureFlight: null,
      returnFlight: null,
      purchaseDate: aiResponse.purchaseDate,
    };

    if (aiResponse.flights.length > 0) {
      const finalTrip = aiResponse.flights.reduce((acc, flight) => {
        const depCode = flight.departureAirportCode?.toUpperCase().trim();

        // IDA (sale de Salta)
        if (depCode === "SLA" && !acc.departureFlight) {
          acc.departureFlight = flight;
        }
        // VUELTA (sale de Buenos Aires)
        else if ((depCode === "AEP" || depCode === "EZE") && !acc.returnFlight) {
          acc.returnFlight = flight;
        }
        return acc;
      }, initialTrip);

      if (!finalTrip.departureFlight && !finalTrip.returnFlight) {
        throw new Error("La IA no pudo extraer ningún detalle de vuelo válido del correo.");
      }

      return finalTrip;
    }

    throw new Error("La IA no pudo encontrar ningún vuelo en el texto proporcionado.");
  } catch (error: any) {
    console.error("Error procesando el email con Gemini (vía Netlify Function):", error);
    throw new Error(`Error de la IA: ${error?.message || "No se pudo procesar el correo."}`);
  }
};
