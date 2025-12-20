import type { Flight, Trip } from "../types";

const SALTA_CODES = ["SLA", "SALTA"];

export function isSalta(code?: string) {
  if (!code) return false;
  return SALTA_CODES.includes(code.toUpperCase());
}

export function inferLegType(flight: Flight | null | undefined): "ida" | "vuelta" {
  if (!flight) return "ida";
  if (isSalta(flight.arrivalAirport)) return "vuelta";
  return "ida";
}

export function normalizeTripFlights(trip: Trip): {
  idaFlight?: Flight;
  vueltaFlight?: Flight;
} {
  const flights = [
    trip.departureFlight,
    trip.returnFlight,
  ].filter(Boolean) as Flight[];

  let idaFlight: Flight | undefined;
  let vueltaFlight: Flight | undefined;

  for (const f of flights) {
    const leg = inferLegType(f);
    if (leg === "ida" && !idaFlight) idaFlight = f;
    if (leg === "vuelta" && !vueltaFlight) vueltaFlight = f;
  }

  return { idaFlight, vueltaFlight };
}
