// services/geminiService.ts
import type { Trip, Flight } from "../types";
import { groupFlightsIntoTrips } from "./groupFlights";

type GeminiResponse = {
  flights: Flight[];
  purchaseDate?: string | null;
};

// -----------------------------
// Helpers de fecha (robustos)
// -----------------------------
const isValidDate = (value: any): boolean => {
  const d = new Date(value);
  return Number.isFinite(d.getTime());
};

const toMsOrInfinity = (value: any): number => {
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

const getGroupStartMs = (group: any): number => {
  const dt =
    group?.outbound?.departureDateTime ||
    group?.inbound?.departureDateTime ||
    null;

  if (!dt) return Number.POSITIVE_INFINITY;
  return toMsOrInfinity(dt);
};

const normalizeFlights = (
  flights: Flight[]
): { valid: Flight[]; invalid: Flight[] } => {
  const valid: Flight[] = [];
  const invalid: Flight[] = [];

  for (const f of flights) {
    const depOk = !!f?.departureDateTime && isValidDate(f.departureDateTime);
    const oriOk = !!f?.departureAirportCode;
    const dstOk = !!f?.arrivalAirportCode;

    if (depOk && oriOk && dstOk) valid.push(f);
    else invalid.push(f);
  }

  return { valid, invalid };
};

// Regla de negocio: IDA sale de SLA; VUELTA llega a SLA.
// Si hay dos vuelos en un grupo, asigna ida/vuelta por aeropuerto.
const assignLegsBySLA = (
  a: Flight | null,
  b: Flight | null
): { departureFlight: Flight | null; returnFlight: Flight | null } => {
  const isSLA = (code: string | null) => (code || "").toUpperCase() === "SLA";

  if (a && b) {
    const aFromSLA = isSLA(a.departureAirportCode);
    const bFromSLA = isSLA(b.departureAirportCode);

    if (aFromSLA && !bFromSLA) return { departureFlight: a, returnFlight: b };
    if (bFromSLA && !aFromSLA) return { departureFlight: b, returnFlight: a };

    // Fallback: más temprano como ida
    return toMsOrInfinity(a.departureDateTime) <= toMsOrInfinity(b.departureDateTime)
      ? { departureFlight: a, returnFlight: b }
      : { departureFlight: b, returnFlight: a };
  }

  // Si hay uno solo: lo ponemos en ida si sale de SLA; si no, en vuelta.
  if (a && !b) {
    return isSLA(a.departureAirportCode)
      ? { departureFlight: a, returnFlight: null }
      : { departureFlight: null, returnFlight: a };
  }
  if (!a && b) {
    return isSLA(b.departureAirportCode)
      ? { departureFlight: b, returnFlight: null }
      : { departureFlight: null, returnFlight: b };
  }

  return { departureFlight: null, returnFlight: null };
};

export const parseFlightEmail = async (
  _apiKey: string, // compatibilidad (no se usa)
  emailText: string,
  pdfBase64?: string | null
): Promise<Array<Omit<Trip, "id" | "createdAt">>> => {
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

    const { valid: validFlights, invalid: invalidFlights } = normalizeFlights(
      aiResponse.flights
    );

    if (validFlights.length === 0) {
      const sample = invalidFlights?.[0] as any;
      const hint =
        sample?.departureDateTime && !isValidDate(sample.departureDateTime)
          ? `Fecha inválida devuelta por IA (departureDateTime="${sample.departureDateTime}"). Probable falta de año.`
          : "La IA devolvió vuelos sin datos mínimos (aeropuertos/fecha).";
      throw new Error(hint);
    }

    // purchaseDate robusto
    let purchaseDate: string;
    if (aiResponse.purchaseDate && isValidDate(aiResponse.purchaseDate)) {
      purchaseDate = String(aiResponse.purchaseDate);
    } else {
      const sortedByDep = [...validFlights].sort(
        (a, b) =>
          toMsOrInfinity(a.departureDateTime) - toMsOrInfinity(b.departureDateTime)
      );
      purchaseDate =
        sortedByDep[0]?.departureDateTime && isValidDate(sortedByDep[0].departureDateTime)
          ? String(sortedByDep[0].departureDateTime)
          : new Date().toISOString();
    }

    // ✅ Aquí está el cambio: en vez de elegir 1, devolvemos TODOS los grupos
    const groups = groupFlightsIntoTrips(validFlights);
    if (!groups || groups.length === 0) {
      throw new Error("No se pudo agrupar ningún vuelo del correo.");
    }

    // Ordenarlos para que se importen “en orden”
    const ordered = [...groups].sort((a, b) => getGroupStartMs(a) - getGroupStartMs(b));

    const trips: Array<Omit<Trip, "id" | "createdAt">> = ordered.map((g) => {
      const a = g.outbound ?? null;
      const b = g.inbound ?? null;

      const { departureFlight, returnFlight } = assignLegsBySLA(a, b);

      return {
        departureFlight,
        returnFlight,
        purchaseDate,
      };
    });

    // Filtrar completamente vacíos por seguridad
    return trips.filter((t) => t.departureFlight || t.returnFlight);
  } catch (error: any) {
    console.error("Error procesando el email con Gemini:", error);
    throw new Error(
      `Error de la IA: ${error?.message || "No se pudo procesar el correo."}`
    );
  }
};
