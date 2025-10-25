import React from 'react';
import type { Trip } from '../types';
import TripCard from './TripCard';
import { ArrowUpRightIcon } from './icons/ArrowUpRightIcon';
import { CalendarClockIcon } from './icons/CalendarClockIcon';
import { CheckBadgeIcon } from './icons/CheckBadgeIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';


interface TripListProps {
  trips: Trip[];
  onDeleteTrip: (tripId: string) => void;
  listFilter: 'all' | 'future' | 'currentMonth' | 'completed';
  nextTripId: string | null;
}

const emptyMessages = {
    all: {
        title: "No tienes ningún viaje",
        message: "Presiona el botón '+' para agregar tu primer viaje.",
        icon: <BriefcaseIcon className="mx-auto h-16 w-16 text-slate-400" />
    },
    future: {
        title: "No tienes viajes futuros",
        message: "Cuando agregues un nuevo viaje, aparecerá aquí.",
        icon: <ArrowUpRightIcon className="mx-auto h-16 w-16 text-slate-400" />
    },
    currentMonth: {
        title: "Sin viajes este mes",
        message: "Tu agenda para el mes actual está despejada.",
        icon: <CalendarClockIcon className="mx-auto h-16 w-16 text-slate-400" />
    },
    completed: {
        title: "No hay viajes completados",
        message: "Los viajes que hayas finalizado se mostrarán aquí.",
        icon: <CheckBadgeIcon className="mx-auto h-16 w-16 text-slate-400" />
    }
};

const getTripEndDate = (trip: Trip): string | null => {
    return trip.returnFlight?.arrivalDateTime || trip.departureFlight?.arrivalDateTime || null;
}

const TripList: React.FC<TripListProps> = ({ trips, onDeleteTrip, listFilter, nextTripId }) => {
  if (trips.length === 0) {
    const { title, message, icon } = emptyMessages[listFilter] || emptyMessages.future;
    return (
      <div className="text-center py-20 px-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80">
        {icon}
        <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">{title}</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{message}</p>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-6">
      {trips.map(trip => {
        const tripEndDate = getTripEndDate(trip);
        const isPast = tripEndDate ? new Date(tripEndDate) < now : false;
        const isNext = trip.id === nextTripId;
        return (
          <TripCard 
            key={trip.id} 
            trip={trip} 
            onDelete={() => onDeleteTrip(trip.id)}
            isPast={isPast}
            isNext={isNext}
          />
        );
      })}
    </div>
  );
};

export default TripList;