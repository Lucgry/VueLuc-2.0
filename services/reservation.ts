export function normalizeReservationCode(value?: string | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  const text = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(confirmacion\s+(de\s+)?reserva|codigo\s+de\s+reserva|codigo|reserva\s+n[°º]?|reserva|booking code|booking reference|pnr|record locator|localizador|n[°º] de reserva|numero de reserva)\s*:?\s*/i, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!text || text === "NODETECTADO" || text === "NA" || text === "N/A") return null;
  return text.length >= 4 && text.length <= 10 ? text : null;
}

export function getFlightReservationCode(flight?: {
  reservationCode?: string | null;
  bookingReference?: string | null;
} | null): string | null {
  return (
    normalizeReservationCode(flight?.reservationCode ?? null) ||
    normalizeReservationCode(flight?.bookingReference ?? null)
  );
}

export function shouldReplaceReservationCode(
  current?: string | null,
  candidate?: string | null
): boolean {
  return !normalizeReservationCode(current) && !!normalizeReservationCode(candidate);
}

export function mergeReservationCode(
  current?: string | null,
  candidate?: string | null,
  context: Record<string, unknown> = {}
): string | null {
  const currentCode = normalizeReservationCode(current);
  const candidateCode = normalizeReservationCode(candidate);

  if (!currentCode) return candidateCode;
  if (!candidateCode || candidateCode === currentCode) return currentCode;

  console.warn("Conflicto de codigo de reserva; se conserva el existente", {
    existing: currentCode,
    candidate: candidateCode,
    ...context,
  });

  return currentCode;
}
