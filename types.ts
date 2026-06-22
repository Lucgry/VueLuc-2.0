// src/types.ts

export interface Flight {
  flightNumber: string | null;
  airline: string | null;
  departureAirportCode: string | null;
  departureCity: string | null;
  arrivalAirportCode: string | null;
  arrivalCity: string | null;
  departureDateTime: string | null;
  arrivalDateTime: string | null;
  cost: number | null;
  paymentMethod: string | null;
  paymentSource?: "gmail" | "email" | "pdf" | "manual" | null;
  paymentUpdatedAt?: string | null;
  bookingReference: string | null;
  passengerName?: string | null;
  source?: "gmail" | "manual" | "email" | null;
  gmailMessageId?: string | null;
  gmailSubject?: string | null;
  gmailDate?: string | null;
  gmailFrom?: string | null;
}

export interface Trip {
  id: string;
  createdAt: string;
  purchaseDate?: string;
  departureFlight: Flight | null;
  returnFlight: Flight | null;
}

export interface BoardingPassData {
  fileURL: string;
  fileType: string;
}

export interface BoardingPassFile {
  id: string;
  tripId: string;
  flightType: "ida" | "vuelta";
  file: File;
}
