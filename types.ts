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
  bookingReference: string | null;
}

export interface Trip {
  id: string;
  createdAt: string;
  purchaseDate?: string;
  departureFlight: Flight | null;
  returnFlight: Flight | null;
  manualSplit?: boolean;
}

export interface BoardingPassData {
  fileURL: string;
  fileType: string;
}

export interface BoardingPassFile {
    id: string;
    tripId: string;
    flightType: 'ida' | 'vuelta';
    file: File;
}