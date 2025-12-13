// src/services/groupFlights.ts

import type { Flight } from "../types";

export interface TripGroup {
  outbound: Flight;
  inbound?: Flight;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function scorePair(outbound: Flight, inbound: Flight): number {
  const outDate = new Date(outbound.departureDateTime);
  const inDate = new Date(inbound.departureDateTime);

  const diffDays = daysBetween(outDate, inDate);

  let score = 0;

  // Ventanas temporales
  if (diffDays >= 1 && diffDays <= 5) score += 100;
  else if (diffDays <= 15) score += 50;
  else if (diffDays <= 45) score += 20;
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

export function groupFlightsIntoTrips(flights: Flight[]): TripGroup[] {
  const remaining = [...flights];
  const trips: TripGroup[] = [];

  // Normalizar códigos
  remaining.forEach(f => {
    f.departureAirportCode = f.departureAirportCode.toUpperCase();
    f.arrivalAirportCode = f.arrivalAirportCode.toUpperCase();
  });

  while (remaining.length > 0) {
    const outbound = remaining.shift()!;
    const outDate = new Date(outbound.departureDateTime);

    let bestMatch: {
      index: number;
      score: number;
      flight: Flight;
    } | null = null;

    remaining.forEach((candidate, index) => {
      // aeropuertos invertidos
      if (
        outbound.departureAirportCode !== candidate.arrivalAirportCode ||
        outbound.arrivalAirportCode !== candidate.departureAirportCode
      ) {
        return;
      }

      const candDate = new Date(candidate.departureDateTime);
      if (candDate <= outDate) return;

      const score = scorePair(outbound, candidate);
      if (score <= 0) return;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index, score, flight: candidate };
      }
    });

    if (bestMatch) {
      remaining.splice(bestMatch.index, 1);
      trips.push({
        outbound,
        inbound: bestMatch.flight,
      });
    } else {
      trips.push({ outbound });
    }
  }

  return trips;
}
