// services/geminiService.ts
import type { Flight } from "../types";

/**
 * El frontend NO maneja API keys.
 * La extracción la hace la Netlify Function /.netlify/functions/gemini (server-side).
 */

export type GeminiResponse = {
  flights: Flight[];
  purchaseDate?: string | null;
};

export type ParsedEmailFlights = {
  flights: Flight[];
  purchaseDate: string; // siempre seteado con fallback
};

const safeDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const pickOldestIso = (a?: string | null, b?: string | null): string | null => {
  const da = safeDate(a ?? null);
  const db = safeDate(b ?? null);
  if (!da && !db) return null;
  if (da && !db) return a ?? null;
  if (!da && db) return b ?? null;
  return da!.getTime() <= db!.getTime() ? (a ?? null) : (b ?? null);
};

const normalizeBookingRef = (s?: string | null): string => (s ?? "").trim();

const validateFlight = (f: any, idx: number) => {
  const br = normalizeBookingRef(f?.bookingReference);
  if (!br) {
    throw new Error(
      `Respuesta inválida de la IA: falta bookingReference en flights[${idx}].`
    );
  }

  // Validaciones defensivas mínimas: no inventamos, pero exigimos estructura base
  // (Si alguno falta, no rompemos todo: pero flight debe ser un objeto.)
  if (typeof f !== "object" || f == null) {
    throw new Error(`Respuesta inválida de la IA: flights[${idx}] no es un objeto.`);
  }
};

export const parseFlightEmail = async (
  _apiKey: string, // se mantiene por compatibilidad; NO se usa.
  emailText: string,
  pdfBase64?: string | null
): Promise<ParsedEmailFlights> => {
  if (!emailText || typeof emailText !== "string" || !emailText.trim()) {
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

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `Error llamando a Gemini (status ${res.status})`;
      throw new Error(msg);
    }

    const aiResponse = data as GeminiResponse;

    if (!aiResponse || !Array.isArray(aiResponse.flights)) {
      throw new Error("Respuesta inválida de la IA: falta 'flights'.");
    }
    if (aiResponse.flights.length === 0) {
      throw new Error("La IA no pudo encontrar ningún vuelo en el texto proporcionado.");
    }

    // Validación defensiva + limpieza mínima
    const flights: Flight[] = aiResponse.flights
      .filter(Boolean)
      .map((f: any, idx: number) => {
        validateFlight(f, idx);

        // Normalizamos cosas mínimas (sin “inventar”):
        return {
          flightNumber: (f.flightNumber ?? "").toString().trim(),
          airline: (f.airline ?? "").toString().trim(),
          departureAirportCode: (f.departureAirportCode ?? "").toString().trim(),
          departureCity: (f.departureCity ?? "").toString().trim(),
          arrivalAirportCode: (f.arrivalAirportCode ?? "").toString().trim(),
          arrivalCity: (f.arrivalCity ?? "").toString().trim(),
          departureDateTime: f.departureDateTime ?? null,
          arrivalDateTime: f.arrivalDateTime ?? null,
          cost:
            typeof f.cost === "number"
              ? f.cost
              : (f.cost != null && !isNaN(Number(f.cost)) ? Number(f.cost) : null),
          paymentMethod: (f.paymentMethod ?? "").toString(),
          bookingReference: normalizeBookingRef(f.bookingReference),
        } as Flight;
      });

    // purchaseDate:
    // - preferimos la que venga del modelo
    // - si no, usamos la fecha más vieja entre los departureDateTime (si hay)
    // - si no, ahora
    const oldestFlightDeparture = flights
      .map((x) => x.departureDateTime)
      .filter(Boolean)
      .reduce<string | null>((acc, cur) => pickOldestIso(acc, cur as any), null);

    const purchaseDate =
      (aiResponse.purchaseDate && String(aiResponse.purchaseDate)) ||
      oldestFlightDeparture ||
      new Date().toISOString();

    return { flights, purchaseDate };
  } catch (error: any) {
    console.error(
      "Error procesando el email con Gemini (vía Netlify Function):",
      error
    );
    throw new Error(
      `Error de la IA: ${error?.message || "No se pudo procesar el correo."}`
    );
  }
};
