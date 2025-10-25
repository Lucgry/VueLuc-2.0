import React, { useState, useEffect, useMemo } from 'react';
import type { Trip } from './types';
import Header from './components/Header';
import TripList from './components/TripList';
import EmailImporter from './components/EmailImporter';
import CostSummary from './components/CostSummary';
import CalendarView from './components/CalendarView';
import NextTripCard from './components/NextTripCard';
import InstallHelpModal from './components/InstallHelpModal'; // Importar nuevo componente
import { PlusCircleIcon } from './components/icons/PlusCircleIcon';
import { ListBulletIcon } from './components/icons/ListBulletIcon';
import { CalendarDaysIcon } from './components/icons/CalendarDaysIcon';
import { CalculatorIcon } from './components/icons/CalculatorIcon';
import { ArrowUpRightIcon } from './components/icons/ArrowUpRightIcon';
import { CalendarClockIcon } from './components/icons/CalendarClockIcon';
import { CheckBadgeIcon } from './components/icons/CheckBadgeIcon';
import { ArchiveBoxIcon } from './components/icons/ArchiveBoxIcon';
import { sampleTrips } from './data/sampleData';

type ListFilter = 'all' | 'future' | 'currentMonth' | 'completed';
type View = 'list' | 'calendar' | 'costs';

// A type guard for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}


const getTripStartDate = (trip: Trip): Date | null => {
    const dateStr = trip.departureFlight?.departureDateTime || trip.returnFlight?.departureDateTime;
    return dateStr ? new Date(dateStr) : null;
};

const getTripEndDate = (trip: Trip): Date | null => {
    const dateStr = trip.returnFlight?.arrivalDateTime || trip.departureFlight?.arrivalDateTime;
    return dateStr ? new Date(dateStr) : null;
};

const App: React.FC = () => {
  const [trips, setTrips] = useState<Trip[]>(() => {
    try {
        const storedTrips = localStorage.getItem('trips');
        if (storedTrips) {
            const parsedTrips = JSON.parse(storedTrips);
            if (Array.isArray(parsedTrips) && parsedTrips.length > 0) {
                return parsedTrips;
            }
        }
    } catch (error) {
        console.error("Failed to load trips from localStorage", error);
    }
    // If nothing in storage, it's empty, or parsing fails, load sample data
    return sampleTrips;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstallHelpOpen, setIsInstallHelpOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [listFilter, setListFilter] = useState<ListFilter>('future');
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); 
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);


  // Effect to apply the dark class to the html element
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Persist trips to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('trips', JSON.stringify(trips));
    } catch (error) {
      console.error("Failed to save trips to localStorage", error);
    }
  }, [trips]);

  const sortedTrips = useMemo(() => {
    const now = new Date().getTime();

    return [...trips].sort((a, b) => {
      const dateA = getTripStartDate(a);
      const dateB = getTripStartDate(b);

      if (!dateA) return 1;
      if (!dateB) return -1;

      const timeA = dateA.getTime();
      const timeB = dateB.getTime();

      const isFutureA = timeA >= now;
      const isFutureB = timeB >= now;

      // Primary sort: future trips before past trips
      if (isFutureA && !isFutureB) return -1;
      if (!isFutureA && isFutureB) return 1;
      
      // Secondary sort: chronological
      return timeA - timeB;
    });
  }, [trips]);

  const nextTrip = useMemo(() => {
    const now = new Date();
    const futureTrips = sortedTrips.filter(trip => {
        const startDate = getTripStartDate(trip);
        return startDate ? startDate >= now : false;
    });
    return futureTrips.length > 0 ? futureTrips[0] : null;
  }, [sortedTrips]);

  const filteredTrips = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    switch (listFilter) {
      case 'all':
        return sortedTrips;
      case 'future':
        return sortedTrips.filter(trip => {
          const startDate = getTripStartDate(trip);
          return startDate ? startDate.getTime() >= now.getTime() : false;
        });
      case 'currentMonth':
        return sortedTrips.filter(trip => {
          const startDate = getTripStartDate(trip);
          return startDate ? startDate >= startOfMonth && startDate <= endOfMonth : false;
        });
      case 'completed':
        return sortedTrips.filter(trip => {
          const endDate = getTripEndDate(trip);
          return endDate ? endDate.getTime() < now.getTime() : false;
        });
      default:
        return sortedTrips;
    }
  }, [sortedTrips, listFilter]);

  const nextTripId = nextTrip ? nextTrip.id : null;

  const handleAddTrip = (newTripData: Omit<Trip, 'id' | 'createdAt'>) => {
    if (newTripData.bookingReference) {
      const isDuplicate = trips.some(trip => trip.bookingReference === newTripData.bookingReference);
      if (isDuplicate) {
        throw new Error(`Ya existe un viaje con el código de reserva "${newTripData.bookingReference}".`);
      }
    }

    const newTrip: Trip = {
      ...newTripData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setTrips(prevTrips => [...prevTrips, newTrip]);
    setIsModalOpen(false);
  };

  const handleDeleteTrip = (tripId: string) => {
    setTrips(prevTrips => prevTrips.filter(trip => trip.id !== tripId));
  };
  
  const handleThemeToggle = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleInstallClick = async () => {
    if (!installPromptEvent) {
      // If prompt isn't available, show the help modal as a fallback
      setIsInstallHelpOpen(true);
      return;
    }
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setInstallPromptEvent(null);
  };

  const renderView = () => {
    switch (view) {
      case 'calendar':
        return <CalendarView trips={trips} />;
      case 'costs':
        return <CostSummary trips={trips} />;
      case 'list':
      default:
        return <TripList trips={filteredTrips} onDeleteTrip={handleDeleteTrip} listFilter={listFilter} nextTripId={nextTripId} />;
    }
  };

  const viewOptions: { id: View; label: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { id: 'list', label: 'Lista', icon: ListBulletIcon },
    { id: 'calendar', label: 'Calendario', icon: CalendarDaysIcon },
    { id: 'costs', label: 'Costos', icon: CalculatorIcon },
  ];

  const listFilterOptions: { id: ListFilter; label: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { id: 'all', label: 'Todos', icon: ArchiveBoxIcon },
    { id: 'future', label: 'Futuros', icon: ArrowUpRightIcon },
    { id: 'currentMonth', label: 'Mes Actual', icon: CalendarClockIcon },
    { id: 'completed', label: 'Completados', icon: CheckBadgeIcon },
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Header 
        theme={theme} 
        onToggleTheme={handleThemeToggle}
        onInstall={handleInstallClick}
        showInstallButton={!!installPromptEvent}
        onShowInstallHelp={() => setIsInstallHelpOpen(true)}
      />
      
      <div className="flex justify-center p-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm shadow-md mb-6 sticky top-4 z-10">
        {viewOptions.map(option => (
          <button
            key={option.id}
            onClick={() => setView(option.id)}
            className={`flex items-center justify-center space-x-2 w-full px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              view === option.id
                ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow'
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
            }`}
          >
            <option.icon className="h-5 w-5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        ))}
      </div>

      <main>
        {view === 'list' && (
          <>
            {nextTrip && <NextTripCard trip={nextTrip} />}
            <div className="flex space-x-2 mb-6 p-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm shadow-md">
              {listFilterOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => setListFilter(option.id)}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                    listFilter === option.id
                      ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow'
                      : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-500/10'
                  }`}
                >
                  <option.icon className="h-5 w-5" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {renderView()}
      </main>

      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform"
        aria-label="Agregar nuevo viaje"
      >
        <PlusCircleIcon className="h-8 w-8" />
      </button>

      {isModalOpen && <EmailImporter onClose={() => setIsModalOpen(false)} onAddTrip={handleAddTrip} />}
      {isInstallHelpOpen && <InstallHelpModal onClose={() => setIsInstallHelpOpen(false)} />}
    </div>
  );
};

export default App;