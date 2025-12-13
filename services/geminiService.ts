// services/geminiService.ts
import type { Trip, Flight } from "../types";
import { groupFlightsIntoTrips } from "./groupFlights";

// Nota: el schema e instrucciones ya NO viven en el frontend.
// Se ejecutan en la Netlify Function (server-side) para no exponer lógica sensible ni API keys.

type GeminiResponse = {
  flights: Flight[];
  purchaseDate?: string | null;
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
      const msg = data?.error || `Error llamando a Gemini (status ${res.status})`;
      throw new Error(msg);
    }

    const aiResponse = data as GeminiResponse;

    // Validación mínima defensiva
    if (!aiResponse || !Array.isArray(aiResponse.flights)) {
      throw new Error("Respuesta inválida de la IA: falta 'flights'.");
    }
    if (aiResponse.flights.length === 0) {
      throw new Error("La IA no pudo encontrar ningún vuelo en el texto proporcionado.");
    }

    // purchaseDate: no lo forzamos (Gemini puede mandarlo null).
    // Fallback: salida del primer vuelo, y si no existe, "ahora".
    const purchaseDate =
      (aiResponse.purchaseDate && String(aiResponse.purchaseDate)) ||
      aiResponse.flights[0]?.departureDateTime ||
      new Date().toISOString();

    // Agrupar ida/vuelta con reglas robustas (invertidos + ventana temporal + bonus bookingReference)
    const groups = groupFlightsIntoTrips(aiResponse.flights);

    // Elegir grupo principal:
    // - preferimos el que tenga outbound saliendo de SLA
    // - si no, el primero
    const primary =
      groups.find(
        (g) =>
          g?.outbound?.departureAirportCode?.toUpperCase?.().trim?.() === "SLA"
      ) || groups[0];

    if (!primary || !primary.outbound) {
      throw new Error("La IA no pudo extraer ningún detalle de vuelo válido del correo.");
    }

    const finalTrip: Omit<Trip, "id" | "createdAt"> = {
      departureFlight: primary.outbound ?? null,
      returnFlight: primary.inbound ?? null,
      purchaseDate,
    };

    return finalTrip;
  } catch (error: any) {
    console.error("Error procesando el email con Gemini (vía Netlify Function):", error);
    throw new Error(`Error de la IA: ${error?.message || "No se pudo procesar el correo."}`);
  }
};
