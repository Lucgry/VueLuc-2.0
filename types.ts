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

export type FlightStatus = 'paired' | 'loose';

export interface FlightLeg extends Flight {
  id: string;
  createdAt: string;
  purchaseDate?: string;
  status: FlightStatus;
  tripId: string | null; // ID que agrupa una ida y una vuelta
  type: 'ida' | 'vuelta';
}

// Este tipo se usa para agrupar tramos para la visualización en TripCard
// FIX: Renamed DisplayTrip to Trip to resolve import errors.
export interface Trip {
  id: string; // Será el tripId si está emparejado, o el id del leg si está suelto
  departureFlight: FlightLeg | null;
  returnFlight: FlightLeg | null;
  isPaired: boolean;
}


export interface BoardingPassData {
  fileURL: string;
  fileType: string;
}

export interface BoardingPassFile {
    id: string;
    legId: string;
    file: File;
}