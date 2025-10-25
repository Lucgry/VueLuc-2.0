import type { Trip } from '../types';

// Helper function to create dates relative to today
const getRelativeDate = (daysOffset: number, hour: number, minute: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const sampleTrips: Trip[] = [
  // --- Completed Trip (Last Week) ---
  {
    id: 'd8f9b1d3-7c8e-4a6a-8b1e-9f0d1a2c3b4d',
    createdAt: new Date().toISOString(),
    departureFlight: {
      flightNumber: 'AR1450',
      airline: 'Aerolineas Argentinas',
      departureAirportCode: 'SLA',
      departureCity: 'Salta',
      arrivalAirportCode: 'AEP',
      arrivalCity: 'Buenos Aires',
      departureDateTime: getRelativeDate(-7, 10, 30), // Last week, 10:30 AM
      arrivalDateTime: getRelativeDate(-7, 12, 35),   // Last week, 12:35 PM
    },
    returnFlight: {
      flightNumber: 'WJ3265',
      airline: 'JetSmart',
      departureAirportCode: 'AEP',
      departureCity: 'Buenos Aires',
      arrivalAirportCode: 'SLA',
      arrivalCity: 'Salta',
      departureDateTime: getRelativeDate(-4, 18, 0),    // Last week, 6:00 PM
      arrivalDateTime: getRelativeDate(-4, 20, 10),   // Last week, 8:10 PM
    },
    totalCost: 185500.75,
    paymentMethod: 'Tarjeta de Crédito **1234',
    bookingReference: 'HGRT4S',
  },
  // --- Next Trip (Next Week) ---
  {
    id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    createdAt: new Date().toISOString(),
    departureFlight: {
      flightNumber: 'AR1452',
      airline: 'Aerolineas Argentinas',
      departureAirportCode: 'SLA',
      departureCity: 'Salta',
      arrivalAirportCode: 'AEP',
      arrivalCity: 'Buenos Aires',
      departureDateTime: getRelativeDate(7, 11, 0), // Next week, 11:00 AM
      arrivalDateTime: getRelativeDate(7, 13, 0),   // Next week, 1:00 PM
    },
    returnFlight: {
      flightNumber: 'AR2453',
      airline: 'Aerolineas Argentinas',
      departureAirportCode: 'AEP',
      departureCity: 'Buenos Aires',
      arrivalAirportCode: 'SLA',
      arrivalCity: 'Salta',
      departureDateTime: getRelativeDate(10, 19, 30), // 3 days later, 7:30 PM
      arrivalDateTime: getRelativeDate(10, 21, 35),  // 3 days later, 9:35 PM
    },
    totalCost: 210000.00,
    paymentMethod: 'Tarjeta de Crédito **5678',
    bookingReference: 'ZXC8VB',
  },
  // --- Future Trip 1 ---
  {
    id: 'f0e9d8c7-b6a5-4321-fedc-ba9876543210',
    createdAt: new Date().toISOString(),
    departureFlight: {
      flightNumber: 'WJ3264',
      airline: 'JetSmart',
      departureAirportCode: 'SLA',
      departureCity: 'Salta',
      arrivalAirportCode: 'AEP',
      arrivalCity: 'Buenos Aires',
      departureDateTime: getRelativeDate(14, 8, 15), // In 2 weeks, 8:15 AM
      arrivalDateTime: getRelativeDate(14, 10, 20),  // In 2 weeks, 10:20 AM
    },
    returnFlight: {
      flightNumber: 'WJ3265',
      airline: 'JetSmart',
      departureAirportCode: 'AEP',
      departureCity: 'Buenos Aires',
      arrivalAirportCode: 'SLA',
      arrivalCity: 'Salta',
      departureDateTime: getRelativeDate(17, 17, 45), // 3 days later, 5:45 PM
      arrivalDateTime: getRelativeDate(17, 19, 55),  // 3 days later, 7:55 PM
    },
    totalCost: 175990.50,
    paymentMethod: 'Tarjeta de Crédito **1234',
    bookingReference: 'LKJ5HG',
  },
    // --- Future Trip 2 ---
  {
    id: 'c4d5e6f7-a8b9-1234-5678-b1a2c3d4e5f6',
    createdAt: new Date().toISOString(),
    departureFlight: {
      flightNumber: 'AR1450',
      airline: 'Aerolineas Argentinas',
      departureAirportCode: 'SLA',
      departureCity: 'Salta',
      arrivalAirportCode: 'AEP',
      arrivalCity: 'Buenos Aires',
      departureDateTime: getRelativeDate(21, 10, 30), // In 3 weeks, 10:30 AM
      arrivalDateTime: getRelativeDate(21, 12, 35),   // In 3 weeks, 12:35 PM
    },
    returnFlight: {
      flightNumber: 'AR2451',
      airline: 'Aerolineas Argentinas',
      departureAirportCode: 'AEP',
      departureCity: 'Buenos Aires',
      arrivalAirportCode: 'SLA',
      arrivalCity: 'Salta',
      departureDateTime: getRelativeDate(24, 20, 0),  // 3 days later, 8:00 PM
      arrivalDateTime: getRelativeDate(24, 22, 10), // 3 days later, 10:10 PM
    },
    totalCost: 225450.00,
    paymentMethod: 'Tarjeta de Crédito **5678',
    bookingReference: 'MNB3VC',
  },
];
