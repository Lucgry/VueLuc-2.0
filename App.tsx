import React, { useState, useEffect, useMemo } from 'react';
import type { Trip, Flight } from './types';
import Header from './components/Header';
import TripList from './components/TripList';
import EmailImporter from './components/EmailImporter';
import CostSummary from './components/CostSummary';
import CalendarView from './components/CalendarView';
import NextTripCard from './components/NextTripCard';
import { PlusCircleIcon } from './components/icons/PlusCircleIcon';
import { ListBulletIcon } from './components/icons/ListBulletIcon';
import { CalendarDaysIcon } from './components/icons/CalendarDaysIcon';
import { CalculatorIcon } from './components/icons/CalculatorIcon';
import InstallBanner from './components/InstallBanner';
import QuickAddModal from './components/QuickAddModal';
import { BoltIcon } from './components/icons/BoltIcon';
import { initDB, deleteBoardingPassesForTrip } from './services/db';
import AirportModeView from './components/AirportModeView';
import ApiKeySetup from './components/ApiKeySetup';
import { Spinner } from './components/Spinner';

// A type guard for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// FIX: Define AIStudio interface to resolve a type conflict for window.aistudio.
interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
}

declare global {
    interface Window {
        aistudio?: AIStudio;
    }
}

// FIX: Define missing View and ListFilter types.
type View = 'list' | 'calendar' | 'costs';
type ListFilter = 'future' | 'completed' | 'currentMonth' | 'all';


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
        const savedTrips = localStorage.getItem('trips');
        return savedTrips ? JSON.parse(savedTrips) : [];
    } catch (error) {
        console.error("Error loading trips from localStorage", error);
        return [];
    }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [listFilter, setListFilter] = useState<ListFilter>('future');
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallBannerVisible, setIsInstallBannerVisible] = useState(false);
  const [isAirportMode, setIsAirportMode] = useState(false);
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
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

  // Initialize DB on component mount
  useEffect(() => {
    initDB();
  }, []);

  // Effect for saving trips to localStorage
  useEffect(() => {
    try {
        localStorage.setItem('trips', JSON.stringify(trips));
    } catch (error) {
        console.error("Error saving trips to localStorage", error);
    }
  }, [trips]);


  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); 
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const bannerDismissed = sessionStorage.getItem('installBannerDismissed');
      
      if (!isStandalone && !bannerDismissed) {
          setIsInstallBannerVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsInstallBannerVisible(false);
    };
    
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);
  
  useEffect(() => {
      if (theme === 'dark') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', theme);
  }, [theme]);
  
    useEffect(() => {
        const checkKey = async () => {
            try {
                if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                    setIsKeyConfigured(true);
                }
            } catch (error) {
                console.error("Error checking for API key:", error);
                setIsKeyConfigured(false);
            } finally {
                setIsCheckingKey(false);
            }
        };
        checkKey();
    }, []);

    const handleSelectKey = async () => {
        if (window.aistudio) {
            try {
                await window.aistudio.openSelectKey();
                setIsKeyConfigured(true);
            } catch (error) {
                console.error("Error opening API key selection:", error);
            }
        } else {
            alert("La funcionalidad para seleccionar la API key no está disponible en este entorno.");
        }
    };

  const handleToggleTheme = () => {
      setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const handleToggleAirportMode = () => {
      setIsAirportMode(prev => !prev);
  }

  const handleAddTrip = (newTripData: Omit<Trip, 'id' | 'createdAt'>) => {
      const newTrip: Trip = {
          ...newTripData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString()
      };
      
      const isNewTripSingleLeg = (newTrip.departureFlight && !newTrip.returnFlight) || (!newTrip.departureFlight && newTrip.returnFlight);

      // If it's a full round trip, just add it.
      if (!isNewTripSingleLeg) {
          setTrips(prevTrips => [...prevTrips, newTrip]);
          setIsModalOpen(false);
          setIsQuickAddModalOpen(false);
          return;
      }

      // --- SMART MERGE LOGIC ---
      const newFlight = newTrip.departureFlight || newTrip.returnFlight;
      const newFlightDate = new Date(newFlight!.departureDateTime!);
      const isNewTripIda = !!newTrip.departureFlight;

      let bestMatch: { trip: Trip, timeDiff: number } | null = null;
      
      // Find a potential partner trip
      for (const existingTrip of trips) {
          const isExistingSingleLeg = (existingTrip.departureFlight && !existingTrip.returnFlight) || (!existingTrip.departureFlight && existingTrip.returnFlight);
          if (!isExistingSingleLeg) continue;

          const isExistingIda = !!existingTrip.departureFlight;
          // Must be opposite types (ida vs vuelta)
          if (isNewTripIda === isExistingIda) continue;

          const existingFlight = existingTrip.departureFlight || existingTrip.returnFlight;
          const existingFlightDate = new Date(existingFlight!.departureDateTime!);
          
          const timeDiff = Math.abs(newFlightDate.getTime() - existingFlightDate.getTime());
          const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
          
          // Must be within a 10-day window
          if (daysDiff > 10) continue;

          // Vuelta must always be after Ida
          const idaDate = isNewTripIda ? newFlightDate : existingFlightDate;
          const vueltaDate = isNewTripIda ? existingFlightDate : newFlightDate;
          if (vueltaDate < idaDate) continue;

          // If it's the first match or a closer match, save it
          if (!bestMatch || timeDiff < bestMatch.timeDiff) {
              bestMatch = { trip: existingTrip, timeDiff };
          }
      }

      if (bestMatch) {
          const partnerTrip = bestMatch.trip;
          const combinedTrip: Trip = {
              ...partnerTrip,
              departureFlight: isNewTripIda ? newTrip.departureFlight : partnerTrip.departureFlight,
              returnFlight: !isNewTripIda ? newTrip.returnFlight : partnerTrip.returnFlight,
              bookingReference: `${partnerTrip.bookingReference} / ${newTrip.bookingReference}`,
          };
          
          setTrips(prevTrips =>
              prevTrips.map(t => (t.id === partnerTrip.id ? combinedTrip : t))
          );
      } else {
          // No match found, add as a new single trip
          setTrips(prevTrips => [...prevTrips, newTrip]);
      }
      
      setIsModalOpen(false);
      setIsQuickAddModalOpen(false);
  };


  const handleDeleteTrip = async (tripId: string) => {
    try {
        await deleteBoardingPassesForTrip(tripId);
        setTrips(prevTrips => prevTrips.filter(trip => trip.id !== tripId));
    } catch (error) {
        console.error("Error deleting boarding passes from DB", error);
        // Still delete from UI even if DB deletion fails
        setTrips(prevTrips => prevTrips.filter(trip => trip.id !== tripId));
    }
  };

  const handleInstall = () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      installPromptEvent.userChoice.then(choiceResult => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        setInstallPromptEvent(null);
        setIsInstallBannerVisible(false);
      });
    }
  };

  const handleDismissInstallBanner = () => {
    sessionStorage.setItem('installBannerDismissed', 'true');
    setIsInstallBannerVisible(false);
  };

  const sortedTrips = useMemo(() => {
      return [...trips].sort((a, b) => {
          const dateA = getTripStartDate(a);
          const dateB = getTripStartDate(b);
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateA.getTime() - dateB.getTime();
      });
  }, [trips]);

  const nextTrip = useMemo(() => {
      const now = new Date();
      return sortedTrips.find(trip => {
          const startDate = getTripStartDate(trip);
          return startDate ? startDate >= now : false;
      }) || null;
  }, [sortedTrips]);
  
  const nextUpcomingFlightInfo = useMemo(() => {
    const now = new Date();
    for (const trip of sortedTrips) {
        if (trip.departureFlight?.departureDateTime) {
            const depDate = new Date(trip.departureFlight.departureDateTime);
            if (depDate > now) {
                return { trip, flight: trip.departureFlight, flightType: 'ida' as const };
            }
        }
        if (trip.returnFlight?.departureDateTime) {
            const retDate = new Date(trip.returnFlight.departureDateTime);
            if (retDate > now) {
                return { trip, flight: trip.returnFlight, flightType: 'vuelta' as const };
            }
        }
    }
    return null;
  }, [sortedTrips]);

  const filteredTrips = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    switch (listFilter) {
      case 'future':
        return sortedTrips.filter(trip => {
          const endDate = getTripEndDate(trip);
          return endDate ? endDate >= now : true;
        });
      case 'currentMonth':
        return sortedTrips.filter(trip => {
          const startDate = getTripStartDate(trip);
          return startDate ? startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear : false;
        });
      case 'completed':
        return sortedTrips.filter(trip => {
          const endDate = getTripEndDate(trip);
          return endDate ? endDate < now : false;
        }).reverse(); // Show most recently completed first
      case 'all':
      default:
        return sortedTrips;
    }
  }, [sortedTrips, listFilter]);
  
  if (isCheckingKey) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
        </div>
    );
  }

  if (!isKeyConfigured) {
    return <ApiKeySetup onSelectKey={handleSelectKey} />;
  }


  if (isAirportMode) {
    if (nextUpcomingFlightInfo) {
      return (
        <AirportModeView
          trip={nextUpcomingFlightInfo.trip}
          flight={nextUpcomingFlightInfo.flight}
          flightType={nextUpcomingFlightInfo.flightType}
          onClose={handleToggleAirportMode}
        />
      );
    } else {
      return (
        <div className="max-w-4xl mx-auto p-4 md:p-6">
            <Header 
              theme={theme} 
              onToggleTheme={handleToggleTheme}
              isAirportMode={isAirportMode}
              onToggleAirportMode={handleToggleAirportMode}
            />
            <div className="text-center py-20 px-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80">
                <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">Modo Aeropuerto</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">No tienes ningún viaje próximo para mostrar.</p>
            </div>
        </div>
      )
    }
  }


  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {isModalOpen && <EmailImporter onClose={() => setIsModalOpen(false)} onAddTrip={handleAddTrip} />}
      {isQuickAddModalOpen && <QuickAddModal onClose={() => setIsQuickAddModalOpen(false)} onAddTrip={handleAddTrip} />}
      
      <Header 
        theme={theme} 
        onToggleTheme={handleToggleTheme}
        isAirportMode={isAirportMode}
        onToggleAirportMode={handleToggleAirportMode}
      />
      
      <main>
          <>
            {nextTrip && <NextTripCard trip={nextTrip} />}

            <div className="flex justify-between items-center mb-4">
              <div className="flex space-x-1 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-1 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                  {/* View toggles */}
                  <button onClick={() => setView('list')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition ${view === 'list' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}><ListBulletIcon className="w-5 h-5" /></button>
                  <button onClick={() => setView('calendar')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition ${view === 'calendar' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}><CalendarDaysIcon className="w-5 h-5" /></button>
                  <button onClick={() => setView('costs')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition ${view === 'costs' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}><CalculatorIcon className="w-5 h-5" /></button>
              </div>
              
              {view === 'list' && (
                  <select value={listFilter} onChange={(e) => setListFilter(e.target.value as ListFilter)} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      <option value="future">Próximos</option>
                      <option value="completed">Completados</option>
                      <option value="currentMonth">Este Mes</option>
                      <option value="all">Todos</option>
                  </select>
              )}
            </div>

            {view === 'list' && <TripList trips={filteredTrips} onDeleteTrip={handleDeleteTrip} listFilter={listFilter} nextTripId={nextTrip?.id || null} />}
            {view === 'calendar' && <CalendarView trips={trips} />}
            {view === 'costs' && <CostSummary trips={trips} />}
          </>
      </main>
      
      {!isAirportMode && (
          <div className="fixed bottom-6 right-6 flex flex-col items-center space-y-3 z-40">
              <button onClick={() => setIsQuickAddModalOpen(true)} className="bg-amber-500 text-white p-3 rounded-full shadow-lg hover:bg-amber-600 transition" aria-label="Agregado rápido">
                  <BoltIcon className="h-7 w-7" />
              </button>
               <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition animate-pulse-glow" aria-label="Agregar viaje">
                  <PlusCircleIcon className="h-8 w-8" />
              </button>
          </div>
      )}
      
      {isInstallBannerVisible && installPromptEvent && (
        <InstallBanner onInstall={handleInstall} onDismiss={handleDismissInstallBanner} />
      )}
    </div>
  );
};

export default App;
