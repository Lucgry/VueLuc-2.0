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

  if (diffDays >= 1 && diffDays <= 5) return 100;
  if (diffDays >= 6 && diffDays <= 15) return 50;
  if (diffDays >= 16 && diffDays <= 45) return 20;
  return -Infinity;
}

export function groupFlightsIntoTrips(flights: Flight[]): TripGroup[] {
  const remaining = [...flights];
  const trips: TripGroup[] = [];

  while (remaining.length > 0) {
    const outbound = remaining.shift()!;
    const outDep = toUpperSafe(outbound.departureAirportCode);
    const outArr = toUpperSafe(outbound.arrivalAirportCode);
    const outDate = parseDateSafe(outbound.departureDateTime);

    // Si falta info mínima, queda one-way
    if (!outDep || !outArr || !outDate) {
      trips.push({ outbound });
      continue;
    }

    let bestIndex: number | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      const candDep = toUpperSafe(candidate.departureAirportCode);
      const candArr = toUpperSafe(candidate.arrivalAirportCode);
      const candDate = parseDateSafe(candidate.departureDateTime);

      if (!candDep || !candArr || !candDate) continue;

      // Aeropuertos invertidos
      if (outDep !== candArr || outArr !== candDep) continue;

      // Vuelta posterior
      if (candDate <= outDate) continue;

      let score = scorePair(outbound, candidate);

      // Bonus bookingReference (si existe)
      if (
        outbound.bookingReference &&
        candidate.bookingReference &&
        outbound.bookingReference === candidate.bookingReference
      ) {
        score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex !== null) {
      const inbound = remaining.splice(bestIndex, 1)[0];
      trips.push({ outbound, inbound });
    } else {
      trips.push({ outbound });
    }
  }

  return trips;
}
