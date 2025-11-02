import React from 'react';
import type { FlightLeg } from '../types';
import { AirlineLogo } from './AirlineLogo';

interface TripTooltipProps {
  flightLegs: FlightLeg[];
  position: { top: number; left: number };
}

const formatTime = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

const TripTooltip: React.FC<TripTooltipProps> = ({ flightLegs, position }) => {
  if (!flightLegs || flightLegs.length === 0) return null;

  return (
    <div
      className="absolute z-20 w-60 p-3 bg-slate-200 dark:bg-slate-900 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out border border-slate-300 dark:border-slate-700 pointer-events-none"
      style={{ top: position.top, left: position.left, transform: 'translate(-50%, -105%)', willChange: 'transform' }}
      aria-live="polite"
    >
      <div className="space-y-2">
        {flightLegs.map((leg, index) => (
          <div key={index} className="text-xs">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <AirlineLogo airline={leg.airline} size="xs" type="isotipo" />
                    <span className="font-bold text-slate-800 dark:text-slate-100">{leg.flightNumber}</span>
                </div>
                <span className={`font-semibold px-1.5 py-0.5 rounded-full text-[10px] ${leg.type === 'ida' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200' : 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'}`}>
                    {leg.type === 'ida' ? 'Ida' : 'Vuelta'}
                </span>
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-400">
              {formatTime(leg.departureDateTime)} {leg.departureAirportCode} &rarr; {formatTime(leg.arrivalDateTime)} {leg.arrivalAirportCode}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-slate-200 dark:bg-slate-900 transform rotate-45 border-b border-r border-slate-300 dark:border-slate-700"></div>
    </div>
  );
};

export default TripTooltip;