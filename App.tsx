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
import { db, auth, isFirebaseInitialized, firebaseInitializationError, projectId, authDomain } from './firebase';
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
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && projectId) {
        // Proactively check if token refresh works to catch API errors
        currentUser.getIdToken(true)
          .then(() => {
            setAuthRuntimeError(null);
            setUser(currentUser);
            setLoadingAuth(false);
          })
          .catch(error => {
            const errorMessage = error.message || '';
            const isHttpError = error.code === 'auth/network-request-failed' || errorMessage.includes('403') || errorMessage.includes('securetoken') || errorMessage.includes('API_KEY_HTTP_REFERRER_BLOCKED');
            
            if (isHttpError) {
              const isDifferentDomain = authDomain && window.location.hostname !== authDomain;
              const requiredDomains = [
                  window.location.origin,
                  ...(isDifferentDomain ? [`https://${authDomain}`] : [])
              ];
              const domainInstructions = requiredDomains.map(d => `• ${d}/*`).join('\n');

              setAuthRuntimeError({
                message: `¡Casi listo! Tu inicio de sesión funcionó, pero la app no puede mantener la sesión segura.\n\nLa causa más común es que tu clave de API tiene **Restricciones de sitios web** que bloquean esta aplicación.\n\nPor favor, sigue estos pasos:\n1. Haz clic en "Revisar Restricciones de API Key".\n2. Busca la sección "Restricciones de sitios web".\n3. Asegúrate de que **TODAS** las siguientes URLs estén en la lista de sitios permitidos:\n\n${domainInstructions}\n\nSi el problema persiste, verifica que las APIs de Autenticación y STS estén habilitadas (pasos 2 y 3).`,
                links: [
                    {
                        url: `https://console.cloud.google.com/apis/credentials?project=${projectId}`,
                        text: '1. Revisar Restricciones de API Key'
                    },
                    {
                        url: `https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=${projectId}`,
                        text: '2. Habilitar API de Autenticación (Opcional)'
                    },
                    {
                        url: `https://console.cloud.google.com/apis/library/sts.googleapis.com?project=${projectId}`,
                        text: '3. Habilitar API de Tokens (Opcional)'
                    }
                ]
              });
            } else {
               setAuthRuntimeError({ message: `Ocurrió un error inesperado durante la autenticación: ${errorMessage}`});
            }
            setUser(null); // Log out user on verification failure
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
    if (!user || !db) {
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
    if (!user || !db) {
        alert("Debes iniciar sesión para agregar un viaje.");
        return;
    }

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

    const isNewTripSingleLeg = (newTripData.departureFlight && !newTripData.returnFlight) || (!newTripData.departureFlight && newTripData.returnFlight);

    if (!isNewTripSingleLeg) {
        const newTripWithMeta = { ...newTripData, createdAt: new Date().toISOString() };
        await addDoc(collection(db, 'users', user.uid, 'trips'), newTripWithMeta);
        setIsModalOpen(false);
        setIsQuickAddModalOpen(false);
        return;
    }

    const newFlight = newTripData.departureFlight || newTripData.returnFlight;
    const newFlightDate = new Date(newFlight!.departureDateTime!);
    const isNewTripIda = !!newTripData.departureFlight;

    let bestMatch: { trip: Trip, timeDiff: number } | null = null;
    
    for (const existingTrip of trips) {
        const isExistingSingleLeg = (existingTrip.departureFlight && !existingTrip.returnFlight) || (!existingTrip.departureFlight && existingTrip.returnFlight);
        if (!isExistingSingleLeg) continue;
        
        const existingFlight = existingTrip.departureFlight || existingTrip.returnFlight;
        const isExistingTripIda = !!existingTrip.departureFlight;

        if (isNewTripIda === isExistingTripIda) continue;

        const existingFlightDate = new Date(existingFlight!.departureDateTime!);
        const timeDiff = Math.abs(newFlightDate.getTime() - existingFlightDate.getTime());

        if (timeDiff < 15 * 24 * 60 * 60 * 1000) { // 15 days window
            if (!bestMatch || timeDiff < bestMatch.timeDiff) {
                bestMatch = { trip: existingTrip, timeDiff };
            }
        }
    }

    if (bestMatch) {
        const tripToUpdate = { ...bestMatch.trip };
        if (isNewTripIda) {
            tripToUpdate.departureFlight = newFlight;
        } else {
            tripToUpdate.returnFlight = newFlight;
        }
        
        const tripDocRef = doc(db, 'users', user.uid, 'trips', tripToUpdate.id);
        const { id, ...dataToUpdate } = tripToUpdate;
        await updateDoc(tripDocRef, dataToUpdate);
    } else {
        const newTripWithMeta = { ...newTripData, createdAt: new Date().toISOString() };
        await addDoc(collection(db, 'users', user.uid, 'trips'), newTripWithMeta);
    }

    setIsModalOpen(false);
    setIsQuickAddModalOpen(false);
  };
  
  const handleDeleteTrip = async (tripId: string) => {
    if (!user || !db) return;
    try {
        await deleteBoardingPassesForTrip(user.uid, tripId);
        await deleteDoc(doc(db, 'users', user.uid, 'trips', tripId));
    } catch (error) {
        console.error("Error deleting trip:", error);
        alert("No se pudo eliminar el viaje.");
    }
  };

  const sortedTrips = useMemo(() => {
    return [...trips].sort((a, b) => {
        const dateA = getTripStartDate(a);
        const dateB = getTripStartDate(b);
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        return 0;
    });
  }, [trips]);

  const nextTrip = useMemo(() => {
    const now = new Date();
    return sortedTrips.find(trip => {
      const startDate = getTripStartDate(trip);
      return startDate ? startDate > now : false;
    }) || null;
  }, [sortedTrips]);

  const filteredTrips = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    switch(listFilter) {
      case 'future':
        return sortedTrips.filter(trip => {
            const startDate = getTripStartDate(trip);
            return startDate ? startDate >= now : true;
        });
      case 'completed':
        return sortedTrips.filter(trip => {
            const endDate = getTripEndDate(trip);
            return endDate ? endDate < now : false;
        }).reverse(); // Show most recent completed first
      case 'currentMonth':
        return sortedTrips.filter(trip => {
            const startDate = getTripStartDate(trip);
            return startDate ? startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear : false;
        });
      case 'all':
      default:
        return sortedTrips;
    }
  }, [sortedTrips, listFilter]);

  const nextFlightForCountdown = useMemo(() => {
    if (!nextTrip) return null;
    const now = new Date().getTime();
    
    const depTime = nextTrip.departureFlight?.departureDateTime ? new Date(nextTrip.departureFlight.departureDateTime).getTime() : Infinity;
    const retTime = nextTrip.returnFlight?.departureDateTime ? new Date(nextTrip.returnFlight.departureDateTime).getTime() : Infinity;

    if (depTime > now && depTime < retTime) {
      return { flight: nextTrip.departureFlight!, type: 'ida' as const };
    }
    if (retTime > now) {
      return { flight: nextTrip.returnFlight!, type: 'vuelta' as const };
    }
    return null;
  }, [nextTrip]);
  
  const fabAction = (action: 'quick' | 'ai') => {
      if (action === 'quick') {
          setIsQuickAddModalOpen(true);
      } else {
          setIsModalOpen(true);
      }
      setIsFabMenuOpen(false);
  }

  if (loadingAuth) {
    return <FullScreenLoader />;
  }
  
  if (authRuntimeError) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
            <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
                <div className="mx-auto mb-4 bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 w-16 h-16 rounded-full flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out">
                    <InformationCircleIcon className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Error de Autenticación</h1>
                 <div className="mt-6 p-4 rounded-lg bg-red-100/50 dark:bg-red-900/20 text-left flex items-start space-x-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                    <div className="flex-shrink-0 mt-0.5">
                        <InformationCircleIcon className="w-5 h-5 text-red-600 dark:text-red-300" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-red-800 dark:text-red-200">Acción Requerida:</h4>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1 whitespace-pre-wrap">
                            {authRuntimeError.message}
                        </p>
                        {authRuntimeError.links && (
                           <div className="mt-4 flex flex-col space-y-2">
                            {authRuntimeError.links.map((link, index) => (
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
            </div>
        </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!apiKey) {
    return <ApiKeySetup onKeySave={handleApiKeySave} />;
  }
  
  if (isAirportMode && nextFlightForCountdown) {
      return <AirportModeView trip={nextTrip!} flight={nextFlightForCountdown.flight} flightType={nextFlightForCountdown.type} onClose={handleToggleAirportMode} userId={user.uid} />
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
        <Header theme={theme} onToggleTheme={handleToggleTheme} isAirportMode={isAirportMode} onToggleAirportMode={handleToggleAirportMode} />
        
        {isInstallBannerVisible && installPromptEvent && (
            <InstallBanner 
                onInstall={() => installPromptEvent.prompt()}
                onDismiss={() => {
                    setIsInstallBannerVisible(false);
                    sessionStorage.setItem('installBannerDismissed', 'true');
                }}
            />
        )}
        
        {isModalOpen && <EmailImporter apiKey={apiKey} onClose={() => setIsModalOpen(false)} onAddTrip={handleAddTrip} onInvalidApiKey={handleInvalidApiKey} />}
        {isQuickAddModalOpen && <QuickAddModal onClose={() => setIsQuickAddModalOpen(false)} onAddTrip={handleAddTrip} />}

        <main>
            {nextFlightForCountdown && (
                <NextTripCard flight={nextFlightForCountdown.flight} flightType={nextFlightForCountdown.type} />
            )}
            
            <div className="flex justify-center mb-6 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full shadow-neumo-light-in dark:shadow-neumo-dark-in">
                <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center space-x-2 transition-all duration-300 ${view === 'list' ? 'bg-white dark:bg-slate-700 shadow-md' : 'text-slate-500'}`}>
                    <ListBulletIcon className="w-5 h-5" /><span>Lista</span>
                </button>
                <button onClick={() => setView('calendar')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center space-x-2 transition-all duration-300 ${view === 'calendar' ? 'bg-white dark:bg-slate-700 shadow-md' : 'text-slate-500'}`}>
                    <CalendarDaysIcon className="w-5 h-5" /><span>Calendario</span>
                </button>
                <button onClick={() => setView('costs')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center space-x-2 transition-all duration-300 ${view === 'costs' ? 'bg-white dark:bg-slate-700 shadow-md' : 'text-slate-500'}`}>
                    <CalculatorIcon className="w-5 h-5" /><span>Costos</span>
                </button>
            </div>
            
            {view === 'list' && (
              <>
                <div className="flex justify-center mb-6 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full shadow-neumo-light-in dark:shadow-neumo-dark-in">
                  {filterOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setListFilter(key)}
                      className={`px-3 py-1 text-xs sm:text-sm font-semibold rounded-full transition-all duration-300 ${listFilter === key ? 'bg-white dark:bg-slate-700 shadow-md' : 'text-slate-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <TripList trips={filteredTrips} onDeleteTrip={handleDeleteTrip} listFilter={listFilter} nextTripId={nextTrip?.id || null} userId={user.uid} />
              </>
            )}
            {view === 'calendar' && <CalendarView trips={trips} />}
            {view === 'costs' && <CostSummary trips={trips} />}
        </main>
        
        <div className="fixed bottom-6 right-6 z-40">
            {isFabMenuOpen && (
                <div className="flex flex-col items-center space-y-3 mb-3">
                    <button onClick={() => fabAction('quick')} className="group flex items-center space-x-2" aria-label="Agregar viaje manualmente">
                        <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">Manual</span>
                        <div className="w-14 h-14 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg hover:bg-sky-600 transition-all transform hover:scale-110">
                            <PencilSquareIcon className="w-7 h-7" />
                        </div>
                    </button>
                    <button onClick={() => fabAction('ai')} className="group flex items-center space-x-2" aria-label="Agregar viaje con IA">
                         <span className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">Con IA</span>
                        <div className="w-14 h-14 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-lg hover:bg-teal-600 transition-all transform hover:scale-110">
                            <MailIcon className="w-7 h-7" />
                        </div>
                    </button>
                </div>
            )}
            <button
                onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                className={`w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-2xl transform transition-transform duration-300 ease-in-out ${isFabMenuOpen ? 'rotate-45' : ''}`}
                aria-haspopup="true"
                aria-expanded={isFabMenuOpen}
                aria-label="Agregar nuevo viaje"
            >
                <PlusCircleIcon className="w-9 h-9" />
            </button>
        </div>
    </div>
  );
};

export default App;