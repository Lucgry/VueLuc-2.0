import {
  mergeReservationCode,
  normalizeReservationCode,
  shouldReplaceReservationCode,
} from "./reservation.ts";

const extractCases: Array<[string, string]> = [
  ["Código de reserva: ABC123", "ABC123"],
  ["PNR ABC123", "ABC123"],
  ["Record locator: xy9z7q", "XY9Z7Q"],
  ["Número de reserva OGPLLZ", "OGPLLZ"],
];

for (const [input, expected] of extractCases) {
  const actual = normalizeReservationCode(input);
  console.info("[reservation.test] extract", { input, expected, actual });
  if (actual !== expected) {
    throw new Error(`normalizeReservationCode("${input}") => "${actual}", expected "${expected}"`);
  }
}

const preserved = mergeReservationCode("ABC123", "");
if (preserved !== "ABC123") {
  throw new Error(`Expected reservation to be preserved, got ${preserved}`);
}

const completed = mergeReservationCode(null, "Código de reserva: ABC123");
if (completed !== "ABC123") {
  throw new Error(`Expected missing reservation to be completed, got ${completed}`);
}

if (shouldReplaceReservationCode("ABC123", "XYZ789")) {
  throw new Error("Valid reservation should not be replaced by conflicting code");
}
