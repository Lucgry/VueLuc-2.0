import type { Flight, Trip } from "../types";

const SALTA_CODES = ["SLA"];
export const BUENOS_AIRES_CODES = ["BUE", "AEP", "EZE"];
export const DEFAULT_MAX_ROUND_TRIP_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

function norm(s?: string | null) {
  return (s ?? "").trim().toUpperCase();
}

export function isSaltaAirportCode(code?: string | null) {
  return SALTA_CODES.includes(norm(code));
}

export function isBuenosAiresAirportCode(code?: string | null) {
  return BUENOS_AIRES_CODES.includes(norm(code));
}

export function parseFlightDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRoundTripGapDays(
  idaFlight?: Flight | null,
  vueltaFlight?: Flight | null
): number | null {
  const idaDate = parseFlightDate(idaFlight?.departureDateTime ?? null);
  const vueltaDate = parseFlightDate(vueltaFlight?.departureDateTime ?? null);
  if (!idaDate || !vueltaDate) return null;
  return (vueltaDate.getTime() - idaDate.getTime()) / DAY_MS;
}

export function isValidRoundTripPair(
  idaFlight?: Flight | null,
  vueltaFlight?: Flight | null,
  maxDays = DEFAULT_MAX_ROUND_TRIP_DAYS
): boolean {
  if (!idaFlight || !vueltaFlight) return false;
  if (!isSaltaAirportCode(idaFlight.departureAirportCode)) return false;
  if (!isBuenosAiresAirportCode(idaFlight.arrivalAirportCode)) return false;
  if (!isBuenosAiresAirportCode(vueltaFlight.departureAirportCode)) return false;
  if (!isSaltaAirportCode(vueltaFlight.arrivalAirportCode)) return false;

  const gapDays = getRoundTripGapDays(idaFlight, vueltaFlight);
  return gapDays !== null && gapDays > 0 && gapDays <= maxDays;
}

/**
 * Ida = sale de Salta (SLA)
 * Vuelta = llega a Salta (SLA)
 */
export function inferLegType(flight: Flight | null | undefined): "ida" | "vuelta" {
  if (!flight) return "ida";

  // Preferimos codes (más confiable y tipado)
  if (isSaltaAirportCode(flight.arrivalAirportCode)) return "vuelta";
  if (isSaltaAirportCode(flight.departureAirportCode)) return "ida";

  // Fallback por si faltan codes (opcional)
  const arrivalCity = norm((flight as any).arrivalCity);
  const departureCity = norm((flight as any).departureCity);

  if (arrivalCity.includes("SALTA")) return "vuelta";
  if (departureCity.includes("SALTA")) return "ida";

  // Si no se puede inferir, por defecto lo tratamos como ida
  return "ida";
}

export function normalizeTripFlights(trip: Trip): {
  idaFlight?: Flight;
  vueltaFlight?: Flight;
} {
  const flights = [trip.departureFlight, trip.returnFlight].filter(Boolean) as Flight[];

  let idaFlight: Flight | undefined;
  let vueltaFlight: Flight | undefined;

  for (const f of flights) {
    const leg = inferLegType(f);
    if (leg === "ida" && !idaFlight) idaFlight = f;
    if (leg === "vuelta" && !vueltaFlight) vueltaFlight = f;
  }

  return { idaFlight, vueltaFlight };
}
