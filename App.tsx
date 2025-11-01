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
import { PencilSquareIcon } from './components/icons/PencilSquareIcon';
import { MailIcon } from './components/icons/MailIcon';
import { deleteBoardingPassesForTrip } from './services/db';
import AirportModeView from './components/AirportModeView';
import ApiKeySetup from './components/ApiKeySetup';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, isFirebaseInitialized, firebaseInitializationError } from './firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import { FullScreenLoader } from './components/Spinner';
import { BoltIcon } from './components/icons/BoltIcon';
import { InformationCircleIcon } from './components/icons/InformationCircleIcon';
import { ClockIcon } from './components/icons/ClockIcon';

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
  if (!isFirebaseInitialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
        <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
          <div className="mx-auto mb-4 bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 w-16 h-16 rounded-full flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out">
            <ClockIcon className="w-8 h-8 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Finalizando Configuración</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Se están aplicando los cambios en los servicios de la nube. Esto puede tardar uno o dos minutos. La aplicación se conectará en cuanto esté listo.
          </p>
          {firebaseInitializationError && (
            <div className="mt-6 p-4 rounded-lg bg-red-100/50 dark:bg-red-900/20 text-left flex items-start space-x-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                <div className="flex-shrink-0 mt-0.5">
                    <InformationCircleIcon className="w-5 h-5 text-red-600 dark:text-red-300" />
                </div>
                <div>
                    <h4 className="font-semibold text-red-800 dark:text-red-200">Acción Requerida:</h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {firebaseInitializationError.message}
                    </p>
                    {firebaseInitializationError.link && (
                        <a 
                            href={firebaseInitializationError.link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-block px-4 py-2 bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-semibold rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in text-sm"
                        >
                            {firebaseInitializationError.link.text} &rarr;
                        </a>
                    )}
                </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const [trips, setTrips] = useState<Trip[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

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
  
  // Authentication effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth!, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore data loading effect
  useEffect(() => {
    if (!user) {
      setTrips([]);
      return;
    }

    const tripsCollectionRef = collection(db!, 'users', user.uid, 'trips');
    const q = query(tripsCollectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const tripsFromFirestore: Trip[] = [];
      querySnapshot.forEach((doc) => {
        tripsFromFirestore.push({ id: doc.id, ...doc.data() } as Trip);
      });
      setTrips(tripsFromFirestore);
    }, (error) => {
        console.error("Error fetching trips from Firestore:", error);
    });

    return () => unsubscribe();
  }, [user]);

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

  const handleAddTrip = async (newTripData: Omit<Trip, 'id' | 'createdAt'>) => {
    if (!user) {
        alert("Debes iniciar sesión para agregar un viaje.");
        return;
    }

    // --- DUPLICATE CHECK ---
    const isDuplicate = trips.some(existingTrip => {
        const newDepFlight = newTripData.departureFlight;
        const newRetFlight = newTripData.returnFlight;
        const existingDepFlight = existingTrip.departureFlight;
        const existingRetFlight = existingTrip.returnFlight;
        const compareDates = (date1Str?: string | null, date2Str?: string | null) => !date1Str || !date2Str ? false : date1Str.substring(0, 10) === date2Str.substring(0, 10);
        const isFlightMatch = (newFlight: Flight | null, existingFlight: Flight | null) => {
            if (!newFlight || !existingFlight || !newFlight.flightNumber?.trim() || !existingFlight.flightNumber?.trim() || !newFlight.departureDateTime || !existingFlight.departureDateTime) return false;
            const newFlightNum = newFlight.flightNumber.trim().replace(/\s/g, '').toUpperCase();
            const existingFlightNum = existingFlight.flightNumber.trim().replace(/\s/g, '').toUpperCase();
            return newFlightNum === existingFlightNum && compareDates(newFlight.departureDateTime, existingFlight.departureDateTime);
        };
        if ((newDepFlight && (isFlightMatch(newDepFlight, existingDepFlight) || isFlightMatch(newDepFlight, existingRetFlight))) ||
            (newRetFlight && (isFlightMatch(newRetFlight, existingDepFlight) || isFlightMatch(newRetFlight, existingRetFlight)))) {
            return true;
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

    const isNewTripSingleLeg = (newTripData.departureFlight && !newTripData.returnFlight) || (!newTripData.departureFlight && newTripData.returnFlight);

    // If it's a full round trip, just add it.
    if (!isNewTripSingleLeg) {
        const newTripWithMeta = { ...newTripData, createdAt: new Date().toISOString() };
        await addDoc(collection(db!, 'users', user.uid, 'trips'), newTripWithMeta);
        setIsModalOpen(false);
        setIsQuickAddModalOpen(false);
        return;
    }

    // --- SMART MERGE LOGIC ---
    const newFlight = newTripData.departureFlight || newTripData.returnFlight;
    const newFlightDate = new Date(newFlight!.departureDateTime!);
    const isNewTripIda = !!newTripData.departureFlight;

    let bestMatch: { trip: Trip, timeDiff: number } | null = null;
    
    for (const existingTrip of trips) {
        const isExistingSingleLeg = (existingTrip.departureFlight && !existingTrip.returnFlight) || (!existingTrip.departureFlight && existingTrip.returnFlight);
        if (!isExistingSingleLeg) continue;
        const isExistingIda = !!existingTrip.departureFlight;
        if (isNewTripIda === isExistingIda) continue;
        const existingFlight = existingTrip.departureFlight || existingTrip.returnFlight;
        const existingFlightDate = new Date(existingFlight!.departureDateTime!);
        const timeDiff = Math.abs(newFlightDate.getTime() - existingFlightDate.getTime());
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        if (daysDiff > 10) continue;
        const idaDate = isNewTripIda ? newFlightDate : existingFlightDate;
        const vueltaDate = isNewTripIda ? existingFlightDate : newFlightDate;
        if (vueltaDate < idaDate) continue;
        if (!bestMatch || timeDiff < bestMatch.timeDiff) {
            bestMatch = { trip: existingTrip, timeDiff };
        }
    }

    if (bestMatch) {
        const partnerTrip = bestMatch.trip;
        const combinedTripData = {
            departureFlight: isNewTripIda ? newTripData.departureFlight : partnerTrip.departureFlight,
            returnFlight: !isNewTripIda ? newTripData.returnFlight : partnerTrip.returnFlight,
            bookingReference: `${partnerTrip.bookingReference} / ${newTripData.bookingReference}`,
        };
        const tripRef = doc(db!, 'users', user.uid, 'trips', partnerTrip.id);
        await updateDoc(tripRef, combinedTripData);
    } else {
        const newTripWithMeta = { ...newTripData, createdAt: new Date().toISOString() };
        await addDoc(collection(db!, 'users', user.uid, 'trips'), newTripWithMeta);
    }
    
    setIsModalOpen(false);
    setIsQuickAddModalOpen(false);
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!user) return;
    try {
        await deleteBoardingPassesForTrip(user.uid, tripId);
        const tripDocRef = doc(db!, 'users', user.uid, 'trips', tripId);
        await deleteDoc(tripDocRef);
    } catch (error) {
        console.error("Error deleting trip and associated files:", error);
        alert("Hubo un problema al eliminar el viaje.");
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
    const allFlightsWithDates = sortedTrips.flatMap(trip => {
      const flights = [];
      if (trip.departureFlight?.departureDateTime && !isNaN(new Date(trip.departureFlight.departureDateTime).getTime())) {
        flights.push({ trip, flight: trip.departureFlight, flightType: 'ida' as const, date: new Date(trip.departureFlight.departureDateTime) });
      }
      if (trip.returnFlight?.departureDateTime && !isNaN(new Date(trip.returnFlight.departureDateTime).getTime())) {
        flights.push({ trip, flight: trip.returnFlight, flightType: 'vuelta' as const, date: new Date(trip.returnFlight.departureDateTime) });
      }
      return flights;
    });

    const futureFlights = allFlightsWithDates.filter(item => item.date > now);
    if (futureFlights.length === 0) return null;

    futureFlights.sort((a, b) => a.date.getTime() - b.date.getTime());
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
  
// FIX: Add conditional rendering logic and return statement for the component.
  if (loadingAuth) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!apiKey) {
    return <ApiKeySetup onKeySave={handleApiKeySave} />;
  }
  
  if (isAirportMode && nextUpcomingFlightInfo) {
    return (
      <AirportModeView
        trip={nextUpcomingFlightInfo.trip}
        flight={nextUpcomingFlightInfo.flight}
        flightType={nextUpcomingFlightInfo.flightType}
        onClose={handleToggleAirportMode}
        userId={user.uid}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Header
          theme={theme}
          onToggleTheme={handleToggleTheme}
          isAirportMode={isAirportMode}
          onToggleAirportMode={handleToggleAirportMode}
        />
        <main className="pb-24">
          {isInstallBannerVisible && (
            <InstallBanner onInstall={handleInstall} onDismiss={handleDismissInstallBanner} />
          )}

          {nextUpcomingFlightInfo && !isAirportMode && (
            <NextTripCard flight={nextUpcomingFlightInfo.flight} flightType={nextUpcomingFlightInfo.flightType} />
          )}

          <div className="flex justify-center space-x-2 mb-6 p-1 bg-slate-100 dark:bg-slate-800 rounded-full shadow-neumo-light-in dark:shadow-neumo-dark-in">
            <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center space-x-2 ${view === 'list' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>
                <ListBulletIcon className="w-5 h-5" /> <span>Lista</span>
            </button>
            <button onClick={() => setView('calendar')} className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center space-x-2 ${view === 'calendar' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>
                <CalendarDaysIcon className="w-5 h-5" /> <span>Calendario</span>
            </button>
            <button onClick={() => setView('costs')} className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center space-x-2 ${view === 'costs' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>
                <CalculatorIcon className="w-5 h-5" /> <span>Costos</span>
            </button>
          </div>

          {view === 'list' && (
            <>
              <div className="flex justify-center space-x-1 mb-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-full shadow-neumo-light-in dark:shadow-neumo-dark-in text-sm font-semibold">
                <button onClick={() => setListFilter('future')} className={`px-4 py-1.5 rounded-full transition-all ${listFilter === 'future' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>Futuros</button>
                <button onClick={() => setListFilter('currentMonth')} className={`px-4 py-1.5 rounded-full transition-all ${listFilter === 'currentMonth' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>Este Mes</button>
                <button onClick={() => setListFilter('completed')} className={`px-4 py-1.5 rounded-full transition-all ${listFilter === 'completed' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>Completados</button>
                <button onClick={() => setListFilter('all')} className={`px-4 py-1.5 rounded-full transition-all ${listFilter === 'all' ? 'bg-white dark:bg-slate-700 shadow-neumo-light-out dark:shadow-neumo-dark-out' : 'text-slate-500'}`}>Todos</button>
              </div>
              <TripList
                trips={filteredTrips}
                onDeleteTrip={handleDeleteTrip}
                listFilter={listFilter}
                nextTripId={nextUpcomingFlightInfo?.trip.id || null}
                userId={user.uid}
              />
            </>
          )}

          {view === 'calendar' && <CalendarView trips={trips} />}
          {view === 'costs' && <CostSummary trips={trips} />}
        </main>
        
        <div className="fixed bottom-6 right-6 z-40">
          <div className="relative">
            {isFabMenuOpen && (
              <div className="flex flex-col items-center space-y-3 mb-3">
                <button onClick={handleAiImportClick} title="Importar con IA" className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow">
                  <MailIcon className="w-7 h-7" />
                </button>
                <button onClick={handleQuickAddClick} title="Agregar manualmente" className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow">
                  <PencilSquareIcon className="w-7 h-7" />
                </button>
              </div>
            )}
            <button onClick={() => setIsFabMenuOpen(!isFabMenuOpen)} className={`w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg transition-transform duration-300 ${isFabMenuOpen ? 'rotate-45' : ''}`}>
              <PlusCircleIcon className="w-9 h-9" />
            </button>
          </div>
        </div>

        {isModalOpen && apiKey && (
          <EmailImporter
            apiKey={apiKey}
            onClose={() => setIsModalOpen(false)}
            onAddTrip={handleAddTrip}
            onInvalidApiKey={handleInvalidApiKey}
          />
        )}
        {isQuickAddModalOpen && (
          <QuickAddModal
            onClose={() => setIsQuickAddModalOpen(false)}
            onAddTrip={handleAddTrip}
          />
        )}
      </div>
    </div>
  );
};

// FIX: Add default export to the App component.
export default App;