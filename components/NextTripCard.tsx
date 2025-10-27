import React, { useState, useEffect } from 'react';
import type { Trip, Flight } from '../types';
import { AirlineLogo } from './AirlineLogo';
import { XCircleIcon } from './icons/XCircleIcon';


interface NextTripCardProps {
  trip: Trip;
}

const calculateCountdown = (targetDate: string) => {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const difference = target - now;

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isPast: false };
};

const formatTimeValue = (value: number) => value.toString().padStart(2, '0');
const formatTime = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};


const NextTripCard: React.FC<NextTripCardProps> = ({ trip }) => {
  const now = new Date();
  const { departureFlight, returnFlight } = trip;
  const departureDateTime = departureFlight?.departureDateTime ? new Date(departureFlight.departureDateTime) : null;
  
  let upcomingFlight: Flight | null = departureFlight;
  let upcomingFlightType: 'ida' | 'vuelta' = 'ida';

  if (departureDateTime && departureDateTime < now) {
    upcomingFlight = returnFlight;
    upcomingFlightType = 'vuelta';
  }

  const nextFlightDate = upcomingFlight?.departureDateTime;
  
  if (!nextFlightDate) return null;

  const [countdown, setCountdown] = useState(calculateCountdown(nextFlightDate));
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(calculateCountdown(nextFlightDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [nextFlightDate]);
  
  const destination = upcomingFlight?.arrivalCity || 'Destino';
  const flightNumber = upcomingFlight?.flightNumber || 'N/A';
  const airline = upcomingFlight?.airline || null;
  const flightLabel = upcomingFlightType === 'ida' ? 'Ida' : 'Vuelta';

  return (
    <div className="mb-6 p-4 md:p-5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg border border-indigo-400">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold">Próximo Viaje ({flightLabel})</h2>
          <p className="text-indigo-200 font-semibold">{`✈️ Vuelo a ${destination}`}</p>
        </div>
        <div className="bg-white/20 p-2 rounded-full flex items-center justify-center">
            <AirlineLogo airline={airline} size="xs" />
        </div>
      </div>
      
      {countdown.isPast ? (
        <div className="text-center my-4 py-4">
             <span className="text-4xl font-extrabold tracking-tighter">¡En Vuelo!</span>
        </div>
      ) : (
        <div className="flex justify-center items-end space-x-2 my-4 text-center">
          <div>
            <span className="text-5xl font-extrabold tracking-tighter">{formatTimeValue(countdown.days)}</span>
            <span className="text-sm font-medium text-indigo-200 block -mt-1">días</span>
          </div>
           <span className="text-4xl font-bold pb-1">:</span>
          <div>
            <span className="text-5xl font-extrabold tracking-tighter">{formatTimeValue(countdown.hours)}</span>
            <span className="text-sm font-medium text-indigo-200 block -mt-1">hs</span>
          </div>
           <span className="text-4xl font-bold pb-1">:</span>
          <div>
            <span className="text-5xl font-extrabold tracking-tighter">{formatTimeValue(countdown.minutes)}</span>
            <span className="text-sm font-medium text-indigo-200 block -mt-1">min</span>
          </div>
        </div>
      )}
      
      <div className="text-center font-semibold text-indigo-100 bg-black/20 px-3 py-1.5 rounded-lg">
        {`Sale a las ${formatTime(nextFlightDate)} hs - Vuelo ${flightNumber}`}
      </div>
    </div>
  );
};

export default NextTripCard;