import React, { useState, useMemo, useRef } from 'react';
import type { Trip, Flight } from '../types';
import { AirlineLogo } from './AirlineLogo';
import { PlaneTakeoffIcon } from './icons/PlaneTakeoffIcon';
import { CalendarDaysIcon } from './icons/CalendarDaysIcon';
import TripTooltip from './TripTooltip';
import { ListBulletIcon } from './icons/ListBulletIcon';
import { Squares2x2Icon } from './icons/Squares2x2Icon';


const formatFullDate = (date: Date): string => {
    return date.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

interface FlightInfo {
    flight: Flight;
    trip: Trip;
    type: 'ida' | 'vuelta';
}

const CalendarView: React.FC<{ trips: Trip[] }> = ({ trips }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'agenda' | 'grid'>('agenda');
  const [tooltip, setTooltip] = useState<{ flights: FlightInfo[]; position: { top: number; left: number } } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);


  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const flightsInMonth = useMemo(() => {
    const flightsMap: { [day: number]: FlightInfo[] } = {};
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    trips.forEach(trip => {
      const processFlight = (flight: Flight | null, type: 'ida' | 'vuelta') => {
        if (flight?.departureDateTime) {
          const flightDate = new Date(flight.departureDateTime);
          if (flightDate.getFullYear() === year && flightDate.getMonth() === month) {
            const day = flightDate.getDate();
            if (!flightsMap[day]) {
              flightsMap[day] = [];
            }
            flightsMap[day].push({ flight, trip, type });
          }
        }
      };
      processFlight(trip.departureFlight, 'ida');
      processFlight(trip.returnFlight, 'vuelta');
    });

    for (const day in flightsMap) {
        flightsMap[day].sort((a, b) => new Date(a.flight.departureDateTime!).getTime() - new Date(b.flight.departureDateTime!).getTime());
    }

    return flightsMap;
  }, [currentDate, trips]);

  const agendaFlightsByDay = useMemo(() => {
    return Object.entries(flightsInMonth)
      .map(([day, flights]) => ({
        date: new Date(currentDate.getFullYear(), currentDate.getMonth(), parseInt(day)),
        flights: flights,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [flightsInMonth, currentDate]);

  const handleDayHover = (e: React.MouseEvent<HTMLDivElement>, day: number) => {
    const dayFlights = flightsInMonth[day];
    if (dayFlights && dayFlights.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();

      setTooltip({
        flights: dayFlights,
        position: {
          top: rect.top - (containerRect?.top || 0),
          left: rect.left + rect.width / 2 - (containerRect?.left || 0),
        },
      });
    }
  };

  const renderGridView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    const gridCells = [];
    dayNames.forEach(day => {
        gridCells.push(<div key={day} className="text-center font-bold text-xs text-slate-500 dark:text-slate-400 py-2">{day}</div>);
    });

    for (let i = 0; i < firstDayOfMonth; i++) {
      gridCells.push(<div key={`empty-${i}`} className="rounded-lg h-16 sm:h-20" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const flightsOnDay = flightsInMonth[day] || [];
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
      
        gridCells.push(
        <div
          key={day}
          className="relative p-1.5 text-center h-16 sm:h-20 flex flex-col items-center justify-start rounded-lg transition-colors duration-200 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50"
          onMouseEnter={(e) => handleDayHover(e, day)}
          onMouseLeave={() => setTooltip(null)}
          onTouchStart={(e) => handleDayHover(e as any, day)}
          onTouchEnd={() => setTooltip(null)}
        >
          <span className={`text-sm font-semibold ${isToday ? 'bg-indigo-600 text-white rounded-full flex items-center justify-center w-6 h-6' : 'text-slate-700 dark:text-slate-200'}`}>
            {day}
          </span>
          {flightsOnDay.length > 0 && (
             <div className="flex justify-center items-center space-x-1 mt-2">
                {flightsOnDay.slice(0, 3).map(({type}, index) => (
                    <div key={index} className={`w-2 h-2 rounded-full ${type === 'ida' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                ))}
                {flightsOnDay.length > 3 && <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>}
            </div>
          )}
        </div>
      );
    }
    
    return (
        <div className="grid grid-cols-7 gap-1">
            {gridCells}
        </div>
    );
  };

  const renderAgendaView = () => {
    return agendaFlightsByDay.length > 0 ? (
      <div className="space-y-6">
        {agendaFlightsByDay.map(({ date, flights }) => (
          <div key={date.toString()}>
            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-300 capitalize pb-2 mb-3 border-b border-slate-200 dark:border-slate-700">
              {formatFullDate(date)}
            </h3>
            <div className="space-y-3">
              {flights.map(({ flight, trip, type }) => (
                <div key={`${trip.id}-${type}`} className="flex items-center space-x-4 p-3 rounded-lg shadow-neumo-light-in dark:shadow-neumo-dark-in">
                  <div className="flex-shrink-0">
                      <AirlineLogo airline={flight.airline} size="sm" type="isotipo" />
                  </div>
                  <div className="flex-grow">
                      <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{flight.flightNumber}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${type === 'ida' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200' : 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'}`}>
                              {type === 'ida' ? 'Ida' : 'Vuelta'}
                          </span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 mt-1">
                          <span>{formatTime(flight.departureDateTime)}</span>
                          <span className="font-mono">{flight.departureAirportCode}</span>
                          <PlaneTakeoffIcon className="w-4 h-4" />
                          <span className="font-mono">{flight.arrivalAirportCode}</span>
                      </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-20 px-6">
          <CalendarDaysIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
          <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">Sin vuelos este mes</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Tu agenda para este mes está despejada.</p>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out p-2 sm:p-4 md:p-6 min-h-[60vh]">
      <div className="flex justify-between items-center mb-6">
        <button onClick={handlePrevMonth} className="p-2 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow duration-200" aria-label="Mes anterior">&lt;</button>
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white capitalize text-center">
          {currentDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center space-x-2">
            <div className="flex space-x-1 bg-slate-200 dark:bg-slate-900/50 p-1 rounded-xl shadow-neumo-light-in dark:shadow-neumo-dark-in">
                <button onClick={() => setViewMode('agenda')} className={`p-1.5 rounded-lg transition-shadow duration-200 ${viewMode === 'agenda' ? 'shadow-neumo-light-in dark:shadow-neumo-dark-in text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`} aria-label="Vista de agenda"><ListBulletIcon className="w-5 h-5"/></button>
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-shadow duration-200 ${viewMode === 'grid' ? 'shadow-neumo-light-in dark:shadow-neumo-dark-in text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`} aria-label="Vista de cuadrícula"><Squares2x2Icon className="w-5 h-5"/></button>
            </div>
            <button onClick={handleNextMonth} className="p-2 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow duration-200" aria-label="Mes siguiente">&gt;</button>
        </div>
      </div>

      {viewMode === 'agenda' ? renderAgendaView() : renderGridView()}

      {tooltip && <TripTooltip flights={tooltip.flights} position={tooltip.position} />}
    </div>
  );
};

export default CalendarView;