import type { Flight, Trip } from "../types";

const SALTA_CODES = ["SLA"];

function norm(s?: string | null) {
  return (s ?? "").trim().toUpperCase();
}

export function isSaltaAirportCode(code?: string | null) {
  return SALTA_CODES.includes(norm(code));
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
