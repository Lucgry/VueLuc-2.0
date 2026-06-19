// services/groupFlights.ts
import type { Flight } from "../types";
import {
  DEFAULT_MAX_ROUND_TRIP_DAYS,
  isBuenosAiresAirportCode,
  isSaltaAirportCode,
  isValidRoundTripPair,
  parseFlightDate,
} from "./tripLeg.ts";

export interface TripGroup {
  outbound: Flight;
  inbound?: Flight;
}

function getDepartureMs(flight: Flight): number {
  return parseFlightDate(flight.departureDateTime)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function isOutbound(flight: Flight): boolean {
  return (
    isSaltaAirportCode(flight.departureAirportCode) &&
    isBuenosAiresAirportCode(flight.arrivalAirportCode)
  );
}

function isInbound(flight: Flight): boolean {
  return (
    isBuenosAiresAirportCode(flight.departureAirportCode) &&
    isSaltaAirportCode(flight.arrivalAirportCode)
  );
}

function sameBookingReference(a: Flight, b: Flight): boolean {
  return !!a.bookingReference && !!b.bookingReference && a.bookingReference === b.bookingReference;
}

export function groupFlightsIntoTrips(
  flights: Flight[],
  maxRoundTripDays = DEFAULT_MAX_ROUND_TRIP_DAYS
): TripGroup[] {
  const orderedFlights = [...flights].sort((a, b) => getDepartureMs(a) - getDepartureMs(b));
  const usedInboundIndexes = new Set<number>();
  const trips: TripGroup[] = [];

  for (let i = 0; i < orderedFlights.length; i++) {
    const outbound = orderedFlights[i];

    if (usedInboundIndexes.has(i)) continue;

    if (!isOutbound(outbound)) {
      trips.push({ outbound });
      continue;
    }

    let bestIndex: number | null = null;
    let bestMs = Number.POSITIVE_INFINITY;

    for (let j = i + 1; j < orderedFlights.length; j++) {
      if (usedInboundIndexes.has(j)) continue;

      const candidate = orderedFlights[j];

      if (!isInbound(candidate)) continue;
      if (!isValidRoundTripPair(outbound, candidate, maxRoundTripDays)) {
        console.info("[groupFlights] Vuelta descartada para ida por temporalidad/ruta invalida", {
          ida: outbound.departureDateTime,
          vuelta: candidate.departureDateTime,
          idaRoute: `${outbound.departureAirportCode}-${outbound.arrivalAirportCode}`,
          vueltaRoute: `${candidate.departureAirportCode}-${candidate.arrivalAirportCode}`,
        });
        continue;
      }

      const candidateMs = getDepartureMs(candidate);
      if (
        candidateMs < bestMs ||
        (candidateMs === bestMs &&
          bestIndex !== null &&
          sameBookingReference(outbound, candidate) &&
          !sameBookingReference(outbound, orderedFlights[bestIndex]))
      ) {
        bestMs = candidateMs;
        bestIndex = j;
      }
    }

    if (bestIndex !== null) {
      usedInboundIndexes.add(bestIndex);
      trips.push({ outbound, inbound: orderedFlights[bestIndex] });
    } else {
      trips.push({ outbound });
    }
  }

  return trips;
}
