// services/groupFlights.ts
import type { Flight } from "../types";

export interface TripGroup {
  outbound: Flight;
  inbound?: Flight;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toUpperSafe(v: unknown): string {
  return typeof v === "string" ? v.toUpperCase().trim() : "";
}

function parseDateSafe(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function scorePair(outbound: Flight, inbound: Flight): number {
  const outDate = parseDateSafe(outbound.departureDateTime);
  const inDate = parseDateSafe(inbound.departureDateTime);
  if (!outDate || !inDate) return -Infinity;

  const diffDays = daysBetween(outDate, inDate);

  let score = 0;

  // Ventanas temporales acordadas
  if (diffDays >= 1 && diffDays <= 5) score += 100;
  else if (diffDays >= 6 && diffDays <= 15) score += 50;
  else if (diffDays >= 16 && diffDays <= 45) score += 20;
  else return -Infinity;

  // Bonus si coincide bookingReference (si existe)
  if (
    outbound.bookingReference &&
    inbound.bookingReference &&
    outbound.bookingReference === inbound.bookingReference
  ) {
    score += 30;
  }

  return score;
}

type Match = { index: number; score: number; flight: Flight };

export function groupFlightsIntoTrips(flights: Flight[]): TripGroup[] {
  const remaining = [...flights];
  const trips: TripGroup[] = [];

  // Normalizar códigos de forma segura (sin asumir non-null)
  remaining.forEach((f) => {
    // Si tus tipos son readonly, quitá estas 2 líneas y usá variables locales.
    (f as any).departureAirportCode = toUpperSafe(f.departureAirportCode);
    (f as any).arrivalAirportCode = toUpperSafe(f.arrivalAirportCode);
  });

  while (remaining.length > 0) {
    const outbound = remaining.shift()!;
    const outDep = toUpperSafe(outbound.departureAirportCode);
    const outArr = toUpperSafe(outbound.arrivalAirportCode);
    const outDate = parseDateSafe(outbound.departureDateTime);

    // Si no tenemos datos mínimos, no intentamos emparejar: queda one-way
    if (!outDep || !outArr || !outDate) {
      trips.push({ outbound });
      continue;
    }

    let bestMatch: Match | null = null;

    remaining.forEach((candidate, index) => {
      const candDep = toUpperSafe(candidate.departureAirportCode);
      const candArr = toUpperSafe(candidate.arrivalAirportCode);
      const candDate = parseDateSafe(candidate.departureDateTime);

      if (!candDep || !candArr || !candDate) return;

      // Aeropuertos invertidos (condición obligatoria)
      if (outDep !== candArr || outArr !== candDep) return;

      // Vuelta debe ser posterior
      if (candDate <= outDate) return;

      const score = scorePair(outbound, candidate);
      if (score === -Infinity) return;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index, score, flight: candidate };
      }
    });

    if (bestMatch) {
      remaining.splice(bestMatch.index, 1);
      trips.push({ outbound, inbound: bestMatch.flight });
    } else {
      trips.push({ outbound });
    }
  }

  return trips;
}
