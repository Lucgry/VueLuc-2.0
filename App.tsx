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
import { db, auth, isFirebaseInitialized, firebaseInitializationError, projectId } from './firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import { FullScreenLoader } from './components/Spinner';
import { BoltIcon } from './components/icons/BoltIcon';
import { InformationCircleIcon } from './components/icons/InformationCircleIcon';
import { ClockIcon } from './components/icons/ClockIcon';
import { ArrowUpRightIcon } from './components/icons/ArrowUpRightIcon';
import { CalendarClockIcon } from './components/icons/CalendarClockIcon';
import { CheckBadgeIcon } from './components/icons/CheckBadgeIcon';
import { BriefcaseIcon } from './components/icons/BriefcaseIcon';

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

const filterOptions: { key: ListFilter; label: string }[] = [
  { key: 'future', label: 'Futuros' },
  { key: 'currentMonth', label: 'Este Mes' },
  { key: 'completed', label: 'Completados' },
  { key: 'all', label: 'Todos' },
];

const getTripStartDate = (trip: Trip): Date | null => {
    const dateStr = trip.departureFlight?.departureDateTime || trip.returnFlight?.departureDateTime;
    return dateStr ? new Date(dateStr) : null;
};

const getTripEndDate = (trip: Trip): Date | null => {
    const dateStr = trip.returnFlight?.arrivalDateTime || trip.departureFlight?.arrivalDateTime;
    return dateStr ? new Date(dateStr) : null;
};

const AuthErrorScreen: React.FC<{ error: { links?: { url: string; text: string }[] } }> = ({ error }) => (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
        <div className="mx-auto mb-4 bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 w-16 h-16 rounded-full flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out">
          <InformationCircleIcon className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Error de Autenticación</h1>
        
        <div className="mt-6 p-4 rounded-lg bg-red-100/50 dark:bg-red-900/20 text-left flex items-start space-x-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
            <div className="flex-shrink-0 mt-1">
                <InformationCircleIcon className="w-6 h-6 text-red-600 dark:text-red-300" />
            </div>
            <div>
                <h4 className="font-semibold text-red-800 dark:text-red-200">Acción Requerida:</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  ¡Casi listo! Tu inicio de sesión funcionó, pero la app no puede mantener la sesión segura.
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-3">
                  La causa más común es que tu clave de API tiene **Restricciones de sitios web** que bloquean esta aplicación.
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-3">
                    Por favor, sigue estos pasos:
                </p>
                <ol className="list-decimal list-inside text-sm text-red-700 dark:text-red-300 mt-2 space-y-2">
                    <li>Haz clic en "Revisar Restricciones de API Key".</li>
                    <li>Busca la sección "Restricciones de sitios web".</li>
                    <li>Asegúrate de que **TODAS** las siguientes URLs estén en la lista de sitios permitidos:
                        <ul className="list-disc list-inside pl-5 mt-1 space-y-1">
                            <li><code className="text-xs bg-red-200/50 dark:bg-red-800/30 p-0.5 rounded">https://vueluc-2.netlify.app/*</code></li>
                            <li><code className="text-xs bg-red-200/50 dark:bg-red-800/30 p-0.5 rounded">https://vueluc-app.firebaseapp.com/*</code></li>
                        </ul>
                    </li>
                </ol>
                <p className="text-sm text-red-700 dark:text-red-300 mt-3">
                    Si el problema persiste, verifica que las APIs de Autenticación y STS estén habilitadas (pasos 2 y 3).
                </p>
            </div>
        </div>
        
        {error.links && (
           <div className="mt-6 flex flex-col space-y-3">
             {error.links.map((link, index) => (
               <a 
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex justify-between items-center w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-md hover:bg-slate-50 dark:hover:bg-slate-600 transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in text-sm text-left"
                >
                    <span>{link.text.replace('→', '').trim()}</span>
                    <span>&rarr;</span>
                </a>
             ))}
           </div>
        )}
      </div>
    </div>
);


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
                    {firebaseInitializationError.links && (
                       <div className="mt-4 flex flex-col space-y-2">
                         {firebaseInitializationError.links.map((link, index) => (
                           <a 
                                key={index}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block px-4 py-2 bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-semibold rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in text-sm text-center"
                            >
                                {link.text} &rarr;
                            </a>
                         ))}
                       </div>
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
  const [authRuntimeError, setAuthRuntimeError] = useState<{ message: string; links?: { url: string; text: string; }[] } | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem('gemini_api_key'));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [listFilter, setListFilter] = useState<ListFilter>('future');
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallBannerVisible, setIsInstallBannerVisible] = useState(false);
  const [isAirportMode, setIsAirportMode] = useState(false);
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
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && projectId) {
        setUser(currentUser);
        // Proactively check if token refresh works to catch API errors
        currentUser.getIdToken(true)
          .then(() => {
            setAuthRuntimeError(null);
            setLoadingAuth(false);
          })
          .catch(error => {
            const errorMessage = error.message || '';
            const isHttpError = error.code === 'auth/network-request-failed' || errorMessage.includes('403') || errorMessage.includes('securetoken') || errorMessage.includes('API_KEY_HTTP_REFERRER_BLOCKED');
            
            if (isHttpError) {
                const links = [
                    {
                        url: `https://console.cloud.google.com/apis/credentials?project=${projectId}`,
                        text: '1. Revisar Restricciones de API Key →'
                    },
                    {
                        url: `https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=${projectId}`,
                        text: '2. Habilitar API de Autenticación (Opcional) →'
                    },
                    {
                        url: `https://console.cloud.google.com/apis/library/sts.googleapis.com?project=${projectId}`,
                        text: '3. Habilitar API de Tokens (Opcional) →'
                    }
                ];
                setAuthRuntimeError({ message: "Auth token refresh failed", links });
            } else {
               setAuthRuntimeError({ message: `Ocurrió un error inesperado durante la autenticación: ${errorMessage}`});
            }
            setLoadingAuth(false);
        });
      } else {
        setUser(currentUser);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore data loading effect
  useEffect(() => {
    if (!user || !db || authRuntimeError) { // Do not fetch if there's an auth error
      setTrips([]);
      return;
    }

    const tripsCollectionRef = collection(db, 'users', user.uid, 'trips');
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
  }, [user, authRuntimeError]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); 
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const bannerDismissed = sessionStorage.getItem('vueluc.bannerDismissed');

      if (!isStandalone && !bannerDismissed) {
        setIsInstallBannerVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
  
  const handleKeySave = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setApiKey(key);
  };
  
  const handleInvalidApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey(null);
    alert('La API Key no es válida o ha expirado. Por favor, ingresa una nueva.');
  };

  const handleToggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handleToggleAirportMode = () => {
      setIsAirportMode(prev => !prev);
  }

  const handleUpdateTrip = async (tripId: string, updatedData: Partial<Omit<Trip, 'id' | 'createdAt'>>) => {
    if (!user || !db) return;
    try {
        const tripDocRef = doc(db, 'users', user.uid, 'trips', tripId);
        await updateDoc(tripDocRef, updatedData);
    } catch (error) {
        console.error("Error updating trip in Firestore:", error);
        alert('No se pudo actualizar el viaje. Por favor, intenta de nuevo.');
    }
  };

  const handleAddTrip = async (newTripData: Omit<Trip, 'id' | 'createdAt'>) => {
    if (!user || !db) throw new Error("Usuario no autenticado.");

    // --- LOGICA DE AGRUPACIÓN POR FECHAS ---
    const isSingleIda = newTripData.departureFlight && !newTripData.returnFlight;
    const isSingleVuelta = !newTripData.departureFlight && newTripData.returnFlight;
    
    if (isSingleIda) {
        const ida = newTripData.departureFlight!;
        const idaArrivalTime = new Date(ida.arrivalDateTime!).getTime();

        const potentialMatches = trips.filter(t => t.returnFlight && !t.departureFlight);
        
        if (potentialMatches.length > 0) {
            potentialMatches.sort((a, b) => 
                new Date(a.returnFlight!.departureDateTime!).getTime() - 
                new Date(b.returnFlight!.departureDateTime!).getTime()
            );

            const bestMatch = potentialMatches.find(t => 
                new Date(t.returnFlight!.departureDateTime!).getTime() > idaArrivalTime
            );

            if (bestMatch) {
                await handleUpdateTrip(bestMatch.id, { departureFlight: ida });
                setIsModalOpen(false);
                setIsQuickAddModalOpen(false);
                return;
            }
        }
    }
    
    if (isSingleVuelta) {
        const vuelta = newTripData.returnFlight!;
        const vueltaDepartureTime = new Date(vuelta.departureDateTime!).getTime();

        const potentialMatches = trips.filter(t => t.departureFlight && !t.returnFlight);
        
        if (potentialMatches.length > 0) {
            const pastIdaFlights = potentialMatches.filter(t => 
                new Date(t.departureFlight!.departureDateTime!).getTime() < vueltaDepartureTime
            );

            if (pastIdaFlights.length > 0) {
                pastIdaFlights.sort((a, b) => 
                    new Date(b.departureFlight!.departureDateTime!).getTime() - 
                    new Date(a.departureFlight!.departureDateTime!).getTime()
                );
                
                const bestMatch = pastIdaFlights[0];
                
                await handleUpdateTrip(bestMatch.id, { returnFlight: vuelta });
                setIsModalOpen(false);
                setIsQuickAddModalOpen(false);
                return;
            }
        }
    }
    // --- FIN DE LOGICA DE AGRUPACIÓN ---

    try {
      const tripsCollectionRef = collection(db, 'users', user.uid, 'trips');
      await addDoc(tripsCollectionRef, {
        ...newTripData,
        createdAt: new Date().toISOString(),
      });
      setIsModalOpen(false);
      setIsQuickAddModalOpen(false);
    } catch (error) {
      console.error("Error adding trip to Firestore:", error);
      throw new Error('No se pudo guardar el viaje en la base de datos. Inténtalo de nuevo.');
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!user || !db) return;
    try {
      await deleteBoardingPassesForTrip(user.uid, tripId);
      const tripDocRef = doc(db, 'users', user.uid, 'trips', tripId);
      await deleteDoc(tripDocRef);
    } catch (error) {
      console.error("Error deleting trip:", error);
      alert('No se pudo eliminar el viaje. Por favor, intenta de nuevo.');
    }
  };

  const handleInstall = () => {
    installPromptEvent?.prompt();
    installPromptEvent?.userChoice.then(choiceResult => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setIsInstallBannerVisible(false);
    });
  };

  const handleDismissInstallBanner = () => {
      sessionStorage.setItem('vueluc.bannerDismissed', 'true');
      setIsInstallBannerVisible(false);
  };

  const sortedTrips = useMemo(() => {
      return [...trips].sort((a, b) => {
          const dateA = getTripStartDate(a);
          const dateB = getTripStartDate(b);
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.getTime() - dateA.getTime();
      });
  }, [trips]);
  
  const filteredTrips = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    switch (listFilter) {
      case 'future':
        return sortedTrips.filter(trip => {
          const tripEndDate = getTripEndDate(trip);
          return tripEndDate ? tripEndDate >= now : true;
        });
      case 'completed':
        return sortedTrips.filter(trip => {
          const tripEndDate = getTripEndDate(trip);
          return tripEndDate ? tripEndDate < now : false;
        });
      case 'currentMonth':
         return sortedTrips.filter(trip => {
            const tripStartDate = getTripStartDate(trip);
            return tripStartDate && tripStartDate >= startOfMonth && tripStartDate <= endOfMonth;
        });
      case 'all':
      default:
        return sortedTrips;
    }
  }, [sortedTrips, listFilter]);
  
  const nextTripInfo = useMemo(() => {
    const now = new Date();
    const futureTrips = sortedTrips
      .map(trip => {
        const idaDate = trip.departureFlight?.departureDateTime ? new Date(trip.departureFlight.departureDateTime) : null;
        const vueltaDate = trip.returnFlight?.departureDateTime ? new Date(trip.returnFlight.departureDateTime) : null;
        
        return {
          trip,
          idaDate,
          vueltaDate,
          idaFlight: trip.departureFlight,
          vueltaFlight: trip.returnFlight
        };
      })
      .filter(t => (t.idaDate && t.idaDate > now) || (t.vueltaDate && t.vueltaDate > now));

    if (futureTrips.length === 0) {
      return null;
    }
    
    let nextFlight: Flight | null = null;
    let nextFlightType: 'ida' | 'vuelta' | null = null;
    let nextTrip: Trip | null = null;
    let nextFlightDate = new Date('2999-12-31');

    futureTrips.forEach(t => {
      if (t.idaDate && t.idaDate > now && t.idaDate < nextFlightDate) {
        nextFlightDate = t.idaDate;
        nextFlight = t.idaFlight;
        nextFlightType = 'ida';
        nextTrip = t.trip;
      }
      if (t.vueltaDate && t.vueltaDate > now && t.vueltaDate < nextFlightDate) {
        nextFlightDate = t.vueltaDate;
        nextFlight = t.vueltaFlight;
        nextFlightType = 'vuelta';
        nextTrip = t.trip;
      }
    });

    if (nextFlight && nextTrip && nextFlightType) {
        return {
            trip: nextTrip,
            flight: nextFlight,
            flightType: nextFlightType
        };
    }

    return null;
  }, [sortedTrips]);
  
    if (loadingAuth) {
        return <FullScreenLoader />;
    }

    if (authRuntimeError) {
        return <AuthErrorScreen error={authRuntimeError} />;
    }

    if (!user) {
        return <LoginScreen />;
    }
    
    if (!apiKey) {
      return <ApiKeySetup onKeySave={handleKeySave} />;
    }
    
    if (isAirportMode && nextTripInfo && nextTripInfo.flight) {
        return (
            <AirportModeView 
                trip={nextTripInfo.trip}
                flight={nextTripInfo.flight}
                flightType={nextTripInfo.flightType}
                onClose={handleToggleAirportMode}
                userId={user.uid}
            />
        )
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 font-sans">
            <Header 
                theme={theme} 
                onToggleTheme={handleToggleTheme} 
                isAirportMode={isAirportMode}
                onToggleAirportMode={handleToggleAirportMode}
            />
            <main className="pb-28">
                {isInstallBannerVisible && (
                <InstallBanner 
                    onInstall={handleInstall} 
                    onDismiss={handleDismissInstallBanner}
                />
                )}
                
                {nextTripInfo && nextTripInfo.flight && (
                    <NextTripCard flight={nextTripInfo.flight} flightType={nextTripInfo.flightType} />
                )}

                <div className="mb-4">
                    <div className="bg-slate-200/70 dark:bg-slate-800/50 backdrop-blur-md border border-slate-300/80 dark:border-slate-700/50 p-1 rounded-full flex items-center justify-center space-x-1 max-w-sm mx-auto">
                        {([
                            { viewName: 'list', Icon: ListBulletIcon, label: 'Lista' },
                            { viewName: 'calendar', Icon: CalendarDaysIcon, label: 'Calendario' },
                            { viewName: 'costs', Icon: CalculatorIcon, label: 'Costos' },
                        ] as const).map(({ viewName, Icon, label }) => (
                            <button
                                key={viewName}
                                onClick={() => setView(viewName)}
                                className={`w-full px-3 py-2 text-sm font-semibold rounded-full flex items-center justify-center space-x-2 transition-all duration-300 ${view === viewName ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
                                aria-pressed={view === viewName}
                            >
                                <Icon className="h-5 w-5" />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {view === 'list' && (
                    <div className="mb-6 flex justify-center">
                        <div className="bg-slate-200/70 dark:bg-slate-800/50 backdrop-blur-md border border-slate-300/80 dark:border-slate-700/50 p-1 rounded-full flex items-center space-x-1">
                             {filterOptions.map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setListFilter(opt.key)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-300 ${listFilter === opt.key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
                                    aria-pressed={listFilter === opt.key}
                                >
                                    {opt.label}
                                </button>
                             ))}
                        </div>
                    </div>
                )}

                {view === 'list' && <TripList trips={filteredTrips} onDeleteTrip={handleDeleteTrip} listFilter={listFilter} nextTripId={nextTripInfo?.trip.id ?? null} userId={user.uid} />}
                {view === 'calendar' && <CalendarView trips={trips} />}
                {view === 'costs' && <CostSummary trips={trips} />}

                {isModalOpen && <EmailImporter onClose={() => setIsModalOpen(false)} onAddTrip={handleAddTrip} apiKey={apiKey} onInvalidApiKey={handleInvalidApiKey} />}
                {isQuickAddModalOpen && <QuickAddModal onClose={() => setIsQuickAddModalOpen(false)} onAddTrip={handleAddTrip} />}

                <div className="fixed bottom-6 right-6 z-40">
                    <div className="relative flex flex-col items-center">
                        {isFabMenuOpen && (
                            <div className="flex flex-col items-center space-y-3 mb-3">
                                <div className="group relative">
                                    <button
                                        onClick={() => {
                                            setIsQuickAddModalOpen(true);
                                            setIsFabMenuOpen(false);
                                        }}
                                        className={`w-14 h-14 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ease-in-out hover:scale-110 ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                        style={{ transitionDelay: isFabMenuOpen ? '150ms' : '0ms' }}
                                        aria-label="Agregar viaje manualmente"
                                    >
                                        <PencilSquareIcon className="h-7 w-7 text-sky-600 dark:text-sky-400" />
                                    </button>
                                    <span className="absolute bottom-1/2 translate-y-1/2 right-full mr-3 px-2 py-1 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        Manual
                                    </span>
                                </div>
                            
                                <div className="group relative">
                                    <button
                                        onClick={() => {
                                            setIsModalOpen(true);
                                            setIsFabMenuOpen(false);
                                        }}
                                        className={`w-14 h-14 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ease-in-out hover:scale-110 ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                         style={{ transitionDelay: isFabMenuOpen ? '100ms' : '50ms' }}
                                        aria-label="Agregar viaje con IA"
                                    >
                                        <MailIcon className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                                    </button>
                                    <span className="absolute bottom-1/2 translate-y-1/2 right-full mr-3 px-2 py-1 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        Con IA
                                    </span>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                            className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                            aria-haspopup="true"
                            aria-expanded={isFabMenuOpen}
                        >
                            <PlusCircleIcon className={`h-9 w-9 transition-transform duration-300 ${isFabMenuOpen ? 'rotate-45' : ''}`} />
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;