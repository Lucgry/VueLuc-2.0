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
  userId: string;
}

const emptyMessages = {
    all: {
        title: "No tienes ningún viaje",
        message: "Presiona el botón '+' para agregar tu primer viaje.",
        icon: <BriefcaseIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
    },
    future: {
        title: "No tienes viajes futuros",
        message: "Cuando agregues un nuevo viaje, aparecerá aquí.",
        icon: <ArrowUpRightIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
    },
    currentMonth: {
        title: "Sin viajes este mes",
        message: "Tu agenda para el mes actual está despejada.",
        icon: <CalendarClockIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
    },
    completed: {
        title: "No hay viajes completados",
        message: "Los viajes que hayas finalizado se muestran aquí.",
        icon: <CheckBadgeIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
    }
};

const getTripStartDate = (trip: Trip): string | null => {
    return trip.departureFlight?.departureDateTime || trip.returnFlight?.departureDateTime || null;
}
const getTripEndDate = (trip: Trip): string | null => {
    return trip.returnFlight?.arrivalDateTime || trip.departureFlight?.arrivalDateTime || null;
}

const YearSeparator: React.FC<{ year: number }> = ({ year }) => (
  <div className="flex items-center space-x-4 my-6" aria-hidden="true">
    <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700/50"></div>
    <span className="font-bold text-lg text-slate-500 dark:text-slate-400">{year}</span>
    <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700/50"></div>
  </div>
);

const TripList: React.FC<TripListProps> = ({ trips, onDeleteTrip, listFilter, nextTripId, userId }) => {
  if (trips.length === 0) {
    const { title, message, icon } = emptyMessages[listFilter] || emptyMessages.future;
    return (
      <div className="text-center py-20 px-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700/50 rounded-xl">
        {icon}
        <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">{title}</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{message}</p>
      </div>
    );
  }

  const now = new Date();
  let lastYear: number | null = null;

  return (
    <div className="space-y-6">
      {trips.map(trip => {
        const tripStartDate = getTripStartDate(trip);
        const currentYear = tripStartDate ? new Date(tripStartDate).getFullYear() : null;
        let yearSeparator = null;

        if (currentYear && currentYear !== lastYear) {
          yearSeparator = <YearSeparator year={currentYear} />;
          lastYear = currentYear;
        }

        const tripEndDate = getTripEndDate(trip);
        const isPast = tripEndDate ? new Date(tripEndDate) < now : false;
        const isNext = trip.id === nextTripId;

        return (
          <React.Fragment key={trip.id}>
            {yearSeparator}
            <TripCard 
              trip={trip} 
              onDelete={() => onDeleteTrip(trip.id)}
              isPast={isPast}
              isNext={isNext}
              userId={userId}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default TripList;