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

/**
 * Elige el "inicio" de un grupo:
 * - outbound.departureDateTime
 * - inbound.departureDateTime
 * - Infinity si ninguna fecha es válida
 */
const getGroupStartMs = (group: any): number => {
  const dt =
    group?.outbound?.departureDateTime ||
    group?.inbound?.departureDateTime ||
    null;

  if (!dt) return Number.POSITIVE_INFINITY;
  return toMsOrInfinity(dt);
};

/**
 * Normaliza flights para evitar que una fecha inválida rompa todo el pipeline.
 * - Si departureDateTime inválido, NO lo repara (eso debe venir bien del modelo),
 *   pero permite descartar vuelos inservibles en el agrupado.
 * - Mantiene el resto del objeto intacto.
 */
const normalizeFlights = (
  flights: Flight[]
): { valid: Flight[]; invalid: Flight[] } => {
  const valid: Flight[] = [];
  const invalid: Flight[] = [];

  for (const f of flights) {
    const depOk = !!f?.departureDateTime && isValidDate(f.departureDateTime);

    // ✅ Criterio mínimo alineado con tu interfaz Flight
    const oriOk = !!f?.departureAirportCode;
    const dstOk = !!f?.arrivalAirportCode;

    if (depOk && oriOk && dstOk) valid.push(f);
    else invalid.push(f);
  }

  return { valid, invalid };
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
      const msg =
        data?.error || `Error llamando a Gemini (status ${res.status})`;
      throw new Error(msg);
    }

    const aiResponse = data as GeminiResponse;

    if (!aiResponse || !Array.isArray(aiResponse.flights)) {
      throw new Error("Respuesta inválida de la IA: falta 'flights'.");
    }

    if (aiResponse.flights.length === 0) {
      throw new Error("La IA no pudo encontrar vuelos en el correo.");
    }

    // 1) Normalizar: separar vuelos válidos vs inválidos
    const { valid: validFlights, invalid: invalidFlights } = normalizeFlights(
      aiResponse.flights
    );

    // Si la IA devolvió cosas pero ninguna es utilizable, devolvemos un error con pista clara
    if (validFlights.length === 0) {
      const sample = invalidFlights?.[0] as any;
      const hint =
        sample?.departureDateTime && !isValidDate(sample.departureDateTime)
          ? `Fecha inválida devuelta por IA (departureDateTime="${sample.departureDateTime}"). Probable falta de año.`
          : "La IA devolvió vuelos sin datos mínimos (aeropuertos/fecha).";
      throw new Error(hint);
    }

    // 2) Fecha de compra (fallback robusto)
    //    - Si purchaseDate viene y es válida, usarla
    //    - Sino usar la menor departureDateTime válida
    //    - Sino ahora (último recurso)
    let purchaseDate: string;
    if (aiResponse.purchaseDate && isValidDate(aiResponse.purchaseDate)) {
      purchaseDate = String(aiResponse.purchaseDate);
    } else {
      const sortedByDep = [...validFlights].sort(
        (a, b) =>
          toMsOrInfinity(a.departureDateTime) -
          toMsOrInfinity(b.departureDateTime)
      );
      purchaseDate =
        sortedByDep[0]?.departureDateTime &&
        isValidDate(sortedByDep[0].departureDateTime)
          ? String(sortedByDep[0].departureDateTime)
          : new Date().toISOString();
    }

    /**
     * Agrupación:
     * - NO se decide acá si deben unirse viajes existentes
     * - Solo se agrupan vuelos INTERNOS al mail
     *
     * Importante: agrupamos SOLO vuelos válidos para no contaminar el grouping.
     */
    const groups = groupFlightsIntoTrips(validFlights);

    if (!groups || groups.length === 0) {
      throw new Error("No se pudo agrupar ningún vuelo del correo.");
    }

    /**
     * ✅ ELECCIÓN CORRECTA DEL GRUPO PRINCIPAL
     * - Se elige el grupo con FECHA MÁS PRÓXIMA (válida)
     * - Evita que Infinity gane por accidente
     */
    const primary =
      [...groups]
        .filter((g) => Number.isFinite(getGroupStartMs(g)))
        .sort((a, b) => getGroupStartMs(a) - getGroupStartMs(b))[0] ||
      groups[0];

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
