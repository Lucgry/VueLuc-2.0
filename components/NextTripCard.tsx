import React, { useState, useEffect } from 'react';
import type { Flight } from '../types';
import { AirlineLogo } from './AirlineLogo';
import { XCircleIcon } from './icons/XCircleIcon';


interface NextTripCardProps {
  flight: Flight;
  flightType: 'ida' | 'vuelta';
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

const CountdownUnit: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <div className="flex flex-col items-center w-16">
        <div className="w-full text-center p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
            <span className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tighter">
                {formatTimeValue(value)}
            </span>
        </div>
        <span className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{label}</span>
    </div>
);


const NextTripCard: React.FC<NextTripCardProps> = ({ flight, flightType }) => {
  const nextFlightDate = flight.departureDateTime;
  
  const [countdown, setCountdown] = useState(calculateCountdown(nextFlightDate || ''));
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!nextFlightDate || countdown.isPast) return;

    const timer = setInterval(() => {
      setCountdown(calculateCountdown(nextFlightDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [nextFlightDate, countdown.isPast]);
  
  if (!isVisible || !nextFlightDate || countdown.isPast) {
      return null;
  }

  return (
    <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl p-4 mb-6 border border-slate-200 dark:border-slate-700/50 shadow-sm">
        <button onClick={() => setIsVisible(false)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors z-10">
            <XCircleIcon className="w-6 h-6" />
        </button>

        <h3 className="text-center text-sm font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">
            Próximo Vuelo en:
        </h3>

        <div className="flex justify-center space-x-2 sm:space-x-4">
            <CountdownUnit value={countdown.days} label="Días" />
            <CountdownUnit value={countdown.hours} label="Horas" />
            <CountdownUnit value={countdown.minutes} label="Min." />
            <CountdownUnit value={countdown.seconds} label="Seg." />
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm">
            <div className="flex items-center space-x-3">
                <AirlineLogo airline={flight.airline} size="sm" type="isotipo" />
                <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{flight.flightNumber}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 capitalize">{flightType === 'ida' ? 'Ida' : 'Vuelta'}</p>
                </div>
            </div>
            <div className="text-right">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                    {flight.departureAirportCode} &rarr; {flight.arrivalAirportCode}
                </p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{formatTime(flight.departureDateTime)} hs</p>
            </div>
        </div>
    </div>
  );
};

export default NextTripCard;