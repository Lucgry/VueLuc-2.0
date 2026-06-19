import { groupFlightsIntoTrips } from "./groupFlights.ts";
import type { Flight } from "../types";

const flight = (
  flightNumber: string,
  route: [string, string],
  departureDateTime: string,
  cost: number | null = null
): Flight => ({
  flightNumber,
  airline: "Test",
  departureAirportCode: route[0],
  departureCity: route[0],
  arrivalAirportCode: route[1],
  arrivalCity: route[1],
  departureDateTime,
  arrivalDateTime: departureDateTime,
  cost,
  paymentMethod: null,
  bookingReference: "TEST",
});

const cases = [
  flight("AR1300", ["AEP", "SLA"], "2026-06-03T10:00:00", 10),
  flight("AR1301", ["SLA", "AEP"], "2026-06-13T10:00:00", 20),
  flight("AR1302", ["AEP", "SLA"], "2026-06-16T10:00:00", 30),
  flight("AR1303", ["SLA", "BUE"], "2026-06-23T10:00:00", 40),
  flight("AR1304", ["BUE", "SLA"], "2026-06-24T10:00:00", 50),
  flight("AR1305", ["SLA", "AEP"], "2026-07-04T10:00:00", 60),
  flight("AR1306", ["AEP", "SLA"], "2026-07-07T10:00:00", 70),
];

const grouped = groupFlightsIntoTrips(cases);

const summary = grouped.map((group) => ({
  ida: group.outbound.departureDateTime ?? "",
  vuelta: group.inbound?.departureDateTime ?? null,
  idaCost: group.outbound.cost,
  vueltaCost: group.inbound?.cost ?? null,
}));

console.info("[groupFlights.test] Casos reales de agrupamiento", summary);

if (summary.some((group) => group.vuelta && group.vuelta <= group.ida)) {
  throw new Error("Hay un grupo con vuelta anterior o igual a la ida.");
}

if (!summary.some((group) => group.ida.includes("2026-06-13") && group.vuelta?.includes("2026-06-16"))) {
  throw new Error("13 Jun SLA-AEP no se agrupo con 16 Jun AEP-SLA.");
}

if (!summary.some((group) => group.ida.includes("2026-07-04") && group.vuelta?.includes("2026-07-07"))) {
  throw new Error("4 Jul SLA-AEP no se agrupo con 7 Jul AEP-SLA.");
}

if (!summary.some((group) => group.ida.includes("2026-06-23") && group.vuelta?.includes("2026-06-24"))) {
  throw new Error("23 Jun SLA-BUE no se agrupo con 24 Jun BUE-SLA.");
}
