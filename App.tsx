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
import { MailIcon } from './components/icons/MailIcon';
import { initDB, deleteBoardingPassesForTrip } from './services/db';
import AirportModeView from './components/AirportModeView';
import ApiKeySetup from './components/ApiKeySetup';

// A type guard for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

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
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [listFilter, setListFilter] = useState<ListFilter>('future');
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallBannerVisible, setIsInstallBannerVisible] = useState(false);
  const [isAirportMode, setIsAirportMode] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem('apiKey'));
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
  
  const handleApiKeySave = (key: string) => {
    if (key.trim()) {
        localStorage.setItem('apiKey', key.trim());
        setApiKey(key.trim());
    }
  };

  const handleInvalidApiKey = () => {
      alert("La API Key no es válida o ha expirado. Por favor, configúrala de nuevo.");
      localStorage.removeItem('apiKey');
      setApiKey(null);
  };

  const handleToggleTheme = () => {
      setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const handleToggleAirportMode = () => {
      setIsAirportMode(prev => !prev);
  }

  const handleAddTrip = (newTripData: Omit<Trip, 'id' | 'createdAt'>) => {
      // --- DUPLICATE CHECK ---
      const isDuplicate = trips.some(existingTrip => {
          const newDepFlight = newTripData.departureFlight;
          const newRetFlight = newTripData.returnFlight;

          const existingDepFlight = existingTrip.departureFlight;
          const existingRetFlight = existingTrip.returnFlight;
          
          const compareDates = (date1Str?: string | null, date2Str?: string | null) => {
              if (!date1Str || !date2Str) return false;
              return date1Str.substring(0, 10) === date2Str.substring(0, 10);
          };

          const isFlightMatch = (newFlight: Flight | null, existingFlight: Flight | null) => {
              // Both flights must exist
              if (!newFlight || !existingFlight) return false;
              // Both flights must have a non-empty flight number
              if (!newFlight.flightNumber?.trim() || !existingFlight.flightNumber?.trim()) return false;
              // Both flights must have a departure date
              if (!newFlight.departureDateTime || !existingFlight.departureDateTime) return false;

              // Normalize flight numbers for a robust comparison
              const newFlightNum = newFlight.flightNumber.trim().replace(/\s/g, '').toUpperCase();
              const existingFlightNum = existingFlight.flightNumber.trim().replace(/\s/g, '').toUpperCase();

              return newFlightNum === existingFlightNum &&
                     compareDates(newFlight.departureDateTime, existingFlight.departureDateTime);
          };

          if (newDepFlight) {
              if (isFlightMatch(newDepFlight, existingDepFlight) || isFlightMatch(newDepFlight, existingRetFlight)) {
                  return true;
              }
          }
          
          if (newRetFlight) {
              if (isFlightMatch(newRetFlight, existingDepFlight) || isFlightMatch(newRetFlight, existingRetFlight)) {
                  return true;
              }
          }

          return false;
      });

      if (isDuplicate) {
          alert("Este viaje ya existe y no se ha agregado de nuevo.");
          setIsModalOpen(false);
          setIsQuickAddModalOpen(false);
          return;
      }
      // --- END DUPLICATE CHECK ---


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

  const nextUpcomingFlightInfo = useMemo(() => {
    const now = new Date();
    
    // 1. Aplanamos todos los vuelos (idas y vueltas) en una sola lista.
    const allFlightsWithDates = sortedTrips.flatMap(trip => {
      const flights = [];
      if (trip.departureFlight?.departureDateTime) {
        const date = new Date(trip.departureFlight.departureDateTime);
        // Solo incluimos vuelos con fecha válida.
        if (!isNaN(date.getTime())) {
          flights.push({ trip, flight: trip.departureFlight, flightType: 'ida' as const, date });
        }
      }
      if (trip.returnFlight?.departureDateTime) {
        const date = new Date(trip.returnFlight.departureDateTime);
        // Solo incluimos vuelos con fecha válida.
        if (!isNaN(date.getTime())) {
            flights.push({ trip, flight: trip.returnFlight, flightType: 'vuelta' as const, date });
        }
      }
      return flights;
    });

    // 2. Filtramos para quedarnos solo con los vuelos que son en el futuro.
    const futureFlights = allFlightsWithDates.filter(item => item.date > now);
    
    if (futureFlights.length === 0) {
      return null;
    }

    // 3. Ordenamos los vuelos futuros de forma cronológica para encontrar el más próximo.
    futureFlights.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // 4. El próximo vuelo es el primero de la lista ordenada.
    //    Extraemos las propiedades necesarias para no pasar el objeto 'date' temporal.
    const { trip, flight, flightType } = futureFlights[0];
    return { trip, flight, flightType };
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
  
  const handleQuickAddClick = () => {
    setIsQuickAddModalOpen(true);
    setIsFabMenuOpen(false);
  };

  const handleAiImportClick = () => {
    setIsModalOpen(true);
    setIsFabMenuOpen(false);
  };
  
  if (!apiKey) {
    return <ApiKeySetup onKeySave={handleApiKeySave} />;
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
            <div className="text-center py-20 px-6 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
                <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">Modo Aeropuerto</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">No tienes ningún viaje próximo para mostrar.</p>
            </div>
        </div>
      )
    }
  }


  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {isModalOpen && <EmailImporter apiKey={apiKey} onClose={() => setIsModalOpen(false)} onAddTrip={handleAddTrip} onInvalidApiKey={handleInvalidApiKey} />}
      {isQuickAddModalOpen && <QuickAddModal onClose={() => setIsQuickAddModalOpen(false)} onAddTrip={handleAddTrip} />}
      
      <Header 
        theme={theme} 
        onToggleTheme={handleToggleTheme}
        isAirportMode={isAirportMode}
        onToggleAirportMode={handleToggleAirportMode}
      />
      
      <main className="pb-40">
          <>
            {nextUpcomingFlightInfo && view === 'list' && (
              <NextTripCard 
                flight={nextUpcomingFlightInfo.flight}
                flightType={nextUpcomingFlightInfo.flightType}
              />
            )}

            <div className="flex justify-between items-center mb-4">
              <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
                  {/* View toggles */}
                  <button onClick={() => setView('list')} className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-shadow duration-200 ${view === 'list' ? 'shadow-neumo-light-in dark:shadow-neumo-dark-in text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}><ListBulletIcon className="w-5 h-5" /></button>
                  <button onClick={() => setView('calendar')} className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-shadow duration-200 ${view === 'calendar' ? 'shadow-neumo-light-in dark:shadow-neumo-dark-in text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}><CalendarDaysIcon className="w-5 h-5" /></button>
                  <button onClick={() => setView('costs')} className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-shadow duration-200 ${view === 'costs' ? 'shadow-neumo-light-in dark:shadow-neumo-dark-in text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}><CalculatorIcon className="w-5 h-5" /></button>
              </div>
              
              {view === 'list' && (
                  <select value={listFilter} onChange={(e) => setListFilter(e.target.value as ListFilter)} className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-neumo-light-out dark:shadow-neumo-dark-out appearance-none">
                      <option value="future">Próximos</option>
                      <option value="completed">Completados</option>
                      <option value="currentMonth">Este Mes</option>
                      <option value="all">Todos</option>
                  </select>
              )}
            </div>

            {view === 'list' && <TripList trips={filteredTrips} onDeleteTrip={handleDeleteTrip} listFilter={listFilter} nextTripId={nextUpcomingFlightInfo?.trip.id || null} />}
            {view === 'calendar' && <CalendarView trips={trips} />}
            {view === 'costs' && <CostSummary trips={trips} />}
          </>
      </main>
      
      {!isAirportMode && (
         <>
            {isFabMenuOpen && (
              <div
                className="fixed inset-0 bg-black/40 z-30"
                onClick={() => setIsFabMenuOpen(false)}
                aria-hidden="true"
              />
            )}
            <div className="fixed bottom-6 right-6 flex flex-col items-end space-y-4 z-40">
                <div
                    className={`transition-all duration-300 ease-in-out flex flex-col items-end space-y-4 ${
                    isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                    }`}
                >
                    <div className="flex items-center space-x-3">
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold px-3 py-1.5 rounded-lg shadow-neumo-light-out dark:shadow-neumo-dark-out">
                            Agregado Rápido
                        </span>
                        <button
                            onClick={handleQuickAddClick}
                            className="bg-amber-500 text-white p-3 rounded-full transition-all duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in"
                            aria-label="Agregar viaje manualmente"
                        >
                            <BoltIcon className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex items-center space-x-3">
                         <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold px-3 py-1.5 rounded-lg shadow-neumo-light-out dark:shadow-neumo-dark-out">
                            Importar con IA
                        </span>
                        <button
                            onClick={handleAiImportClick}
                            className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-3 rounded-full transition-all duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in"
                            aria-label="Importar viaje usando IA"
                        >
                            <MailIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>
              
                <button
                    onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                    className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white p-4 rounded-full transition-all duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in active:scale-95 transform"
                    aria-label={isFabMenuOpen ? "Cerrar menú" : "Agregar viaje"}
                    aria-expanded={isFabMenuOpen}
                >
                    <PlusCircleIcon
                    className={`h-8 w-8 transition-transform duration-300 ${
                        isFabMenuOpen ? 'rotate-45' : 'rotate-0'
                    }`}
                    />
                </button>
            </div>
          </>
      )}
      
      {isInstallBannerVisible && installPromptEvent && (
        <InstallBanner onInstall={handleInstall} onDismiss={handleDismissInstallBanner} />
      )}
    </div>
  );
};

export default App;
