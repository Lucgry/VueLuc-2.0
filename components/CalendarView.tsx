import React, { useState, useMemo } from 'react';
import type { Trip } from '../types';
import TripTooltip from './TripTooltip';

const CalendarView: React.FC<{ trips: Trip[] }> = ({ trips }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  
  const handleTripClick = (trip: Trip) => {
    setActiveTrip(trip);
  };

  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 1 for Monday, etc.
    const daysInMonth = lastDayOfMonth.getDate();

    const days = [];
    // Add blank days for the previous month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ key: `prev-${i}`, date: null, isCurrentMonth: false, trips: [] });
    }
    // Add days for the current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayTrips = trips.filter(trip => {
          const departureDateStr = trip.departureFlight?.departureDateTime;
          const returnDateStr = trip.returnFlight?.departureDateTime;

          const isSameDay = (dateStr: string | null | undefined): boolean => {
              if (!dateStr) return false;
              const flightDate = new Date(dateStr);
              return flightDate.getFullYear() === date.getFullYear() &&
                     flightDate.getMonth() === date.getMonth() &&
                     flightDate.getDate() === date.getDate();
          };
          
          return isSameDay(departureDateStr) || isSameDay(returnDateStr);
      });
      days.push({ key: `current-${day}`, date, isCurrentMonth: true, trips: dayTrips });
    }
    return days;
  }, [currentDate, trips]);

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out p-2 sm:p-4 md:p-6">
      <div className="flex justify-between items-center mb-4">
        <button onClick={handlePrevMonth} className="p-2 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow duration-200">&lt;</button>
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white capitalize">
          {currentDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={handleNextMonth} className="p-2 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow duration-200">&gt;</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        {weekDays.map(day => <div key={day} className="py-1 sm:py-2">{day}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarData.map(dayInfo => (
          <div key={dayInfo.key} className={`h-24 md:h-28 rounded-md p-1 transition-colors ${!dayInfo.isCurrentMonth ? 'bg-slate-200 dark:bg-slate-900 opacity-60' : 'bg-slate-100 dark:bg-slate-800 shadow-neumo-light-in dark:shadow-neumo-dark-in'}`}>
            {dayInfo.date && <span className="text-xs sm:text-sm font-semibold">{dayInfo.date.getDate()}</span>}
             <div className="space-y-1 mt-1">
                {dayInfo.trips.map(trip => (
                    <div 
                        key={trip.id} 
                        onClick={() => handleTripClick(trip)}
                        className="bg-indigo-500 text-white font-semibold px-1 py-0.5 rounded-md truncate cursor-pointer hover:bg-indigo-600 text-[10px] sm:text-xs"
                    >
                        {trip.bookingReference || 'Viaje'}
                    </div>
                ))}
            </div>
          </div>
        ))}
      </div>
       {activeTrip && (
            <TripTooltip
                trip={activeTrip}
                onClose={() => setActiveTrip(null)}
            />
        )}
    </div>
  );
};

export default CalendarView;