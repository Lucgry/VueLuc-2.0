export interface Flight {
  flightNumber: string | null;
  airline: string | null;
  departureAirportCode: string | null;
  departureCity: string | null;
  arrivalAirportCode: string | null;
  arrivalCity: string | null;
  departureDateTime: string | null;
  arrivalDateTime: string | null;
}

export interface Trip {
  id: string;
  createdAt: string;
  departureFlight: Flight | null;
  returnFlight: Flight | null;
  totalCost: number | null;
  paymentMethod: string | null;
  bookingReference: string | null;
}