// services/geminiService.ts
import type { Trip, Flight } from "../types";
import { groupFlightsIntoTrips } from "./groupFlights";

type GeminiResponse = {
  flights: Flight[];
  purchaseDate?: string | null;
};

// Helper: obtiene una fecha comparable (ms) para un grupo
const getGroupStartMs = (group: any): number => {
  const dt =
    group?.outbound?.departureDateTime ||
    group?.inbound?.departureDateTime ||
    null;

  if (!dt) return Number.POSITIVE_INFINITY;

  const ms = new Date(dt).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

export const parseFlightEmail = async (
  _apiKey: string, // compatibilidad (no se usa)
  emailText: string,
  pdfBase64?: string | null
): Promise<Omit<Trip, "id" | "createdAt">> => {
  if (!emailText || typeof emailText !== "string") {
    throw new Error("El texto del correo (emailText) es obligatorio.");
  }

  try {
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

    if (!aiResponse || !Array.isArray(aiResponse.flights)) {
      throw new Error("Respuesta inválida de la IA: falta 'flights'.");
    }

    if (aiResponse.flights.length === 0) {
      throw new Error("La IA no pudo encontrar vuelos en el correo.");
    }

    // Fecha de compra (fallback robusto)
    const purchaseDate =
      (aiResponse.purchaseDate && String(aiResponse.purchaseDate)) ||
      aiResponse.flights[0]?.departureDateTime ||
      new Date().toISOString();

    /**
     * Agrupación:
     * - NO se decide acá si deben unirse viajes existentes
     * - Solo se agrupan vuelos INTERNOS al mail
     */
    const groups = groupFlightsIntoTrips(aiResponse.flights);

    if (!groups || groups.length === 0) {
      throw new Error("No se pudo agrupar ningún vuelo del correo.");
    }

    /**
     * ✅ ELECCIÓN CORRECTA DEL GRUPO PRINCIPAL
     * - Se elige el grupo con FECHA MÁS PRÓXIMA
     * - NO por bookingReference
     * - NO por SLA
     */
    const primary = [...groups].sort(
      (a, b) => getGroupStartMs(a) - getGroupStartMs(b)
    )[0];

    if (!primary || (!primary.outbound && !primary.inbound)) {
      throw new Error("No se pudo determinar un grupo de vuelo válido.");
    }

    const finalTrip: Omit<Trip, "id" | "createdAt"> = {
      departureFlight: primary.outbound ?? null,
      returnFlight: primary.inbound ?? null,
      purchaseDate,
    };

    return finalTrip;
  } catch (error: any) {
    console.error("Error procesando el email con Gemini:", error);
    throw new Error(
      `Error de la IA: ${error?.message || "No se pudo procesar el correo."}`
    );
  }
};
