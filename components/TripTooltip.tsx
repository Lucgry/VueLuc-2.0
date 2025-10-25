import React from 'react';
import type { Trip, Flight } from '../types';

interface TripTooltipProps {
  trip: Trip;
  onClose: () => void;
}

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'full' }).format(new Date(dateString));
};

const formatTime = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' }).format(new Date(dateString));
};

const FlightDetailRow: React.FC<{ flight: Flight, type: string }> = ({ flight, type }) => (
    <div>
        <h4 className="font-bold text-md text-indigo-600 dark:text-indigo-400">{type}</h4>
        <p className="text-sm">{formatDate(flight.departureDateTime)}</p>
        <p className="text-sm">{flight.airline} - Vuelo {flight.flightNumber}</p>
        <p className="text-sm font-mono">{formatTime(flight.departureDateTime)} ({flight.departureAirportCode}) &rarr; {formatTime(flight.arrivalDateTime)} ({flight.arrivalAirportCode})</p>
    </div>
);

const TripTooltip: React.FC<TripTooltipProps> = ({ trip, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40 p-4" 
      onClick={onClose}
    >
        <div 
            onClick={e => e.stopPropagation()}
            className="relative z-50 w-full max-w-sm bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-4 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
        >
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg">Detalles del Viaje</h3>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 text-3xl leading-none">&times;</button>
            </div>
            <div className="space-y-3">
                {trip.departureFlight && <FlightDetailRow flight={trip.departureFlight} type="Ida" />}
                {trip.returnFlight && <FlightDetailRow flight={trip.returnFlight} type="Vuelta" />}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-sm space-y-1">
                <p><strong>Ref:</strong> {trip.bookingReference}</p>
                <p><strong>Costo Total:</strong> ${trip.totalCost?.toLocaleString('es-AR')}</p>
            </div>
        </div>
    </div>
  );
};

export default TripTooltip;