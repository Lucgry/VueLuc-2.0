import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Trip, Flight, FlightLeg } from './types';
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
import { deleteBoardingPassesForLegs } from './services/db';
import AirportModeView from './components/AirportModeView';
import ApiKeySetup from './components/ApiKeySetup';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, isFirebaseInitialized, firebaseInitializationError, projectId } from './firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc, writeBatch, getDocs, where } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import { FullScreenLoader } from './components/Spinner';
import { BoltIcon } from './components/icons/BoltIcon';
import { InformationCircleIcon } from './components/icons/InformationCircleIcon';
import { ClockIcon } from './components/icons/ClockIcon';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string; }>;
  prompt(): Promise<void>;
}

type View = 'list' | 'calendar' | 'costs';
type ListFilter = 'future' | 'completed' | 'all';

const filterOptions: { key: ListFilter; label: string }[] = [
  { key: 'future', label: 'Futuros' },
  { key: 'completed', label: 'Completados' },
  { key: 'all', label: 'Todos' },
];

const getFlightLegEndDate = (leg: FlightLeg): Date | null => {
    return leg.arrivalDateTime ? new Date(leg.arrivalDateTime) : null;
};

const AuthErrorScreen: React.FC<{ error: { links?: { url: string; text: string }[] } }> = ({ error }) => (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
        <div className="mx-auto mb-4 bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 w-16 h-16 rounded-full flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out">
          <InformationCircleIcon className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Error de Autenticación</h1>
        <div className="mt-6 p-4 rounded-lg bg-red-100/50 dark:bg-red-900/20 text-left flex items-start space-x-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
            <div className="flex-shrink-0 mt-1"> <InformationCircleIcon className="w-6 h-6 text-red-600 dark:text-red-300" /> </div>
            <div>
                <h4 className="font-semibold text-red-800 dark:text-red-200">Acción Requerida:</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1"> ¡Casi listo! Tu inicio de sesión funcionó, pero la app no puede mantener la sesión segura. </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-3"> La causa más común es que tu clave de API tiene **Restricciones de sitios web** que bloquean esta aplicación. </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-3"> Por favor, sigue estos pasos: </p>
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
                <p className="text-sm text-red-700 dark:text-red-300 mt-3"> Si el problema persiste, verifica que las APIs de Autenticación y STS estén habilitadas (pasos 2 y 3). </p>
            </div>
        </div>
        {error.links && (
           <div className="mt-6 flex flex-col space-y-3">
             {error.links.map((link, index) => (
               <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="flex justify-between items-center w-full px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-md hover:bg-slate-50 dark:hover:bg-slate-600 transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in text-sm text-left">
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
          <p className="mt-2 text-slate-600 dark:text-slate-400"> Se están aplicando los cambios en los servicios de la nube. Esto puede tardar uno o dos minutos. La aplicación se conectará en cuanto esté listo. </p>
          {firebaseInitializationError && (
            <div className="mt-6 p-4 rounded-lg bg-red-100/50 dark:bg-red-900/20 text-left flex items-start space-x-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                <div className="flex-shrink-0 mt-0.5"> <InformationCircleIcon className="w-5 h-5 text-red-600 dark:text-red-300" /> </div>
                <div>
                    <h4 className="font-semibold text-red-800 dark:text-red-200">Acción Requerida:</h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1"> {firebaseInitializationError.message} </p>
                    {firebaseInitializationError.links && (
                       <div className="mt-4 flex flex-col space-y-2">
                         {firebaseInitializationError.links.map((link, index) => (
                           <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-semibold rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in text-sm text-center">
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

  const [flightLegs, setFlightLegs] = useState<FlightLeg[]>([]);
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
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Authentication effect
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && projectId) {
        setUser(currentUser);
        currentUser.getIdToken(true)
          .then(() => { setAuthRuntimeError(null); setLoadingAuth(false); })
          .catch(error => {
            const errorMessage = error.message || '';
            const isHttpError = error.code === 'auth/network-request-failed' || errorMessage.includes('403') || errorMessage.includes('securetoken') || errorMessage.includes('API_KEY_HTTP_REFERRER_BLOCKED');
            if (isHttpError) {
                const links = [
                    { url: `https://console.cloud.google.com/apis/credentials?project=${projectId}`, text: '1. Revisar Restricciones de API Key →' },
                    { url: `https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=${projectId}`, text: '2. Habilitar API de Autenticación (Opcional) →' },
                    { url: `https://console.cloud.google.com/apis/library/sts.googleapis.com?project=${projectId}`, text: '3. Habilitar API de Tokens (Opcional) →' }
                ];
                setAuthRuntimeError({ message: "Auth token refresh failed", links });
            } else { setAuthRuntimeError({ message: `Ocurrió un error inesperado durante la autenticación: ${errorMessage}`}); }
            setLoadingAuth(false);
        });
      } else { setUser(currentUser); setLoadingAuth(false); }
    });
    return () => unsubscribe();
  }, []);

  const runAutomaticPairing = useCallback(async (currentLegs: FlightLeg[]) => {
      if (!user || !db || currentLegs.length < 1) return;

      const legsToProcess = [...currentLegs].sort((a, b) => 
          new Date(a.departureDateTime!).getTime() - new Date(b.departureDateTime!).getTime()
      );

      const batch = writeBatch(db);
      const pairedLegIds = new Set<string>();
      let hasChanges = false;

      for (let i = 0; i < legsToProcess.length; i++) {
          const currentLeg = legsToProcess[i];

          if (pairedLegIds.has(currentLeg.id) || currentLeg.type === 'vuelta') {
              continue; // Ya está emparejado o es una vuelta (solo iniciamos desde idas)
          }

          // Es una IDA, buscar su posible pareja
          let potentialPartner: FlightLeg | null = null;
          for (let j = i + 1; j < legsToProcess.length; j++) {
              const nextLeg = legsToProcess[j];
              if (!pairedLegIds.has(nextLeg.id)) {
                  potentialPartner = nextLeg;
                  break; // Encontramos el siguiente tramo suelto más próximo
              }
          }

          if (potentialPartner && potentialPartner.type === 'vuelta') {
              // Emparejamiento exitoso
              const tripId = currentLeg.id;
              
              if (currentLeg.status !== 'paired' || currentLeg.tripId !== tripId) {
                  const currentLegRef = doc(db, 'users', user.uid, 'flightLegs', currentLeg.id);
                  batch.update(currentLegRef, { status: 'paired', tripId });
                  hasChanges = true;
              }
              if (potentialPartner.status !== 'paired' || potentialPartner.tripId !== tripId) {
                  const partnerLegRef = doc(db, 'users', user.uid, 'flightLegs', potentialPartner.id);
                  batch.update(partnerLegRef, { status: 'paired', tripId });
                  hasChanges = true;
              }

              pairedLegIds.add(currentLeg.id);
              pairedLegIds.add(potentialPartner.id);
          } else {
              // La IDA queda suelta (el siguiente es otra IDA o no hay más)
              if (currentLeg.status !== 'loose' || currentLeg.tripId !== null) {
                   const legRef = doc(db, 'users', user.uid, 'flightLegs', currentLeg.id);
                   batch.update(legRef, { status: 'loose', tripId: null });
                   hasChanges = true;
              }
          }
      }
      
      // Asegurarse de que las vueltas sin pareja estén marcadas como sueltas
      for(const leg of legsToProcess){
          if(leg.type === 'vuelta' && !pairedLegIds.has(leg.id)){
              if (leg.status !== 'loose' || leg.tripId !== null) {
                   const legRef = doc(db, 'users', user.uid, 'flightLegs', leg.id);
                   batch.update(legRef, { status: 'loose', tripId: null });
                   hasChanges = true;
              }
          }
      }

      if (hasChanges) {
          await batch.commit();
      }
  }, [user, db]);

  // Firestore data loading effect
  useEffect(() => {
    if (!user || !db || authRuntimeError) {
      setFlightLegs([]);
      return;
    }

    const legsCollectionRef = collection(db, 'users', user.uid, 'flightLegs');
    const q = query(legsCollectionRef, orderBy('departureDateTime', 'asc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const legsFromFirestore: FlightLeg[] = [];
      querySnapshot.forEach((doc) => {
        legsFromFirestore.push({ id: doc.id, ...doc.data() } as FlightLeg);
      });
      setFlightLegs(legsFromFirestore);
      runAutomaticPairing(legsFromFirestore);
    }, (error) => {
        console.error("Error fetching flight legs from Firestore:", error);
    });

    return () => unsubscribe();
  }, [user, authRuntimeError, runAutomaticPairing]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); 
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      if (!window.matchMedia('(display-mode: standalone)').matches && !sessionStorage.getItem('vueluc.bannerDismissed')) {
        setIsInstallBannerVisible(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
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

  const handleToggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const handleToggleAirportMode = () => setIsAirportMode(prev => !prev);

  const handleAddFlights = async (flights: Flight[], purchaseDate: string) => {
    if (!user || !db) throw new Error("Usuario no autenticado.");

    const legsCollectionRef = collection(db, 'users', user.uid, 'flightLegs');
    
    for (const flight of flights) {
        if (!flight.bookingReference) {
            alert(`Se omitió un vuelo porque no tiene código de reserva.`);
            continue;
        }

        const q = query(legsCollectionRef, where("bookingReference", "==", flight.bookingReference));
        const querySnapshot = await getDocs(q);
        
        const existingLeg = querySnapshot.docs[0];

        if (existingLeg) {
            const existingData = existingLeg.data() as FlightLeg;
            if (existingData.departureDateTime === flight.departureDateTime) {
                alert(`Este tramo ya fue registrado (PNR: ${flight.bookingReference}).`);
                continue; // Bloquear ingreso, duplicado exacto
            } else {
                // Mismo PNR, diferente fecha/hora -> Reemplazar
                await deleteDoc(doc(db, 'users', user.uid, 'flightLegs', existingLeg.id));
                alert(`Se ha reemplazado el tramo anterior con código de reserva ${flight.bookingReference} por un nuevo tramo con fecha/hora actualizada.`);
            }
        }
        
        const depCode = flight.departureAirportCode?.toUpperCase().trim();
        const type = (depCode === 'SLA') ? 'ida' : 'vuelta';

        const newLegData = {
            ...flight,
            purchaseDate,
            createdAt: new Date().toISOString(),
            status: 'loose',
            tripId: null,
            type: type,
        };
        await addDoc(legsCollectionRef, newLegData);
    }
    setIsModalOpen(false);
    setIsQuickAddModalOpen(false);
  };

  const handleDeleteTrip = async (trip: Trip) => {
    if (!user || !db) return;
    try {
        const legIdsToDelete: string[] = [];
        if (trip.departureFlight) legIdsToDelete.push(trip.departureFlight.id);
        if (trip.returnFlight) legIdsToDelete.push(trip.returnFlight.id);

        await deleteBoardingPassesForLegs(user.uid, legIdsToDelete);

        const batch = writeBatch(db);
        legIdsToDelete.forEach(id => {
            const legDocRef = doc(db, 'users', user.uid, 'flightLegs', id);
            batch.delete(legDocRef);
        });
        await batch.commit();

    } catch (error) {
      console.error("Error deleting trip:", error);
      alert('No se pudo eliminar el viaje. Por favor, intenta de nuevo.');
    }
  };

  const handleInstall = () => {
    installPromptEvent?.prompt();
    installPromptEvent?.userChoice.then(choice => {
      setIsInstallBannerVisible(false);
    });
  };

  const handleDismissInstallBanner = () => {
      sessionStorage.setItem('vueluc.bannerDismissed', 'true');
      setIsInstallBannerVisible(false);
  };
    
  const displayTrips = useMemo(() => {
      const pairedTrips = new Map<string, { ida: FlightLeg | null, vuelta: FlightLeg | null }>();
      const looseLegs: FlightLeg[] = [];

      flightLegs.forEach(leg => {
          if (leg.status === 'paired' && leg.tripId) {
              if (!pairedTrips.has(leg.tripId)) {
                  pairedTrips.set(leg.tripId, { ida: null, vuelta: null });
              }
              const tripPair = pairedTrips.get(leg.tripId)!;
              if (leg.type === 'ida') tripPair.ida = leg;
              else tripPair.vuelta = leg;
          } else {
              looseLegs.push(leg);
          }
      });
      
      const combinedList: Trip[] = [];

      // Convertir Map a DisplayTrips
      pairedTrips.forEach((pair, tripId) => {
          combinedList.push({
              id: tripId,
              departureFlight: pair.ida,
              returnFlight: pair.vuelta,
              isPaired: true,
          });
      });

      // Agregar tramos sueltos
      looseLegs.forEach(leg => {
          combinedList.push({
              id: leg.id,
              departureFlight: leg.type === 'ida' ? leg : null,
              returnFlight: leg.type === 'vuelta' ? leg : null,
              isPaired: false,
          });
      });
      
       return combinedList.sort((a, b) => {
            const dateA = a.departureFlight?.departureDateTime || a.returnFlight?.departureDateTime;
            const dateB = b.departureFlight?.departureDateTime || b.returnFlight?.departureDateTime;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
       });
  }, [flightLegs]);
  
  const filteredTrips = useMemo(() => {
    const now = new Date();
    switch (listFilter) {
      case 'future':
        return displayTrips.filter(trip => {
          const endDate = getFlightLegEndDate(trip.returnFlight || trip.departureFlight!);
          return endDate ? endDate >= now : true;
        });
      case 'completed':
        return displayTrips.filter(trip => {
          const endDate = getFlightLegEndDate(trip.returnFlight || trip.departureFlight!);
          return endDate ? endDate < now : false;
        });
      case 'all':
      default:
        return displayTrips;
    }
  }, [displayTrips, listFilter]);
  
  const nextTripInfo = useMemo(() => {
    const now = new Date();
    const futureLegs = flightLegs.filter(leg => leg.departureDateTime && new Date(leg.departureDateTime) > now);

    if (futureLegs.length === 0) return null;
    
    // Ya están ordenados por fecha de salida
    const nextLeg = futureLegs[0];

    const displayTripForNextLeg = displayTrips.find(dt => dt.id === (nextLeg.tripId || nextLeg.id));

    if (nextLeg && displayTripForNextLeg) {
        return {
            trip: displayTripForNextLeg,
            flight: nextLeg,
        };
    }
    return null;
  }, [flightLegs, displayTrips]);
  
    if (loadingAuth) return <FullScreenLoader />;
    if (authRuntimeError) return <AuthErrorScreen error={authRuntimeError} />;
    if (!user) return <LoginScreen />;
    if (!apiKey) return <ApiKeySetup onKeySave={handleKeySave} />;
    
    if (isAirportMode && nextTripInfo && nextTripInfo.flight) {
        return (
            <AirportModeView 
                trip={nextTripInfo.trip}
                flight={nextTripInfo.flight}
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
                <InstallBanner onInstall={handleInstall} onDismiss={handleDismissInstallBanner}/>
                )}
                
                {nextTripInfo && nextTripInfo.flight && (
                    <NextTripCard flight={nextTripInfo.flight} />
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
                {view === 'calendar' && <CalendarView flightLegs={flightLegs} />}
                {view === 'costs' && <CostSummary flightLegs={flightLegs} />}

                {isModalOpen && <EmailImporter onClose={() => setIsModalOpen(false)} onAddFlights={handleAddFlights} apiKey={apiKey} onInvalidApiKey={handleInvalidApiKey} />}
                {isQuickAddModalOpen && <QuickAddModal onClose={() => setIsQuickAddModalOpen(false)} onAddFlights={handleAddFlights} />}

                <div className="fixed bottom-6 right-6 z-40">
                    <div className="relative flex flex-col items-center">
                        {isFabMenuOpen && (
                            <div className="flex flex-col items-center space-y-3 mb-3">
                                <div className="group relative">
                                    <button
                                        onClick={() => { setIsQuickAddModalOpen(true); setIsFabMenuOpen(false); }}
                                        className={`w-14 h-14 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ease-in-out hover:scale-110 ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                        style={{ transitionDelay: isFabMenuOpen ? '150ms' : '0ms' }}
                                        aria-label="Agregar viaje manualmente"
                                    >
                                        <PencilSquareIcon className="h-7 w-7 text-sky-600 dark:text-sky-400" />
                                    </button>
                                    <span className="absolute bottom-1/2 translate-y-1/2 right-full mr-3 px-2 py-1 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"> Manual </span>
                                </div>
                                <div className="group relative">
                                    <button
                                        onClick={() => { setIsModalOpen(true); setIsFabMenuOpen(false); }}
                                        className={`w-14 h-14 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ease-in-out hover:scale-110 ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                         style={{ transitionDelay: isFabMenuOpen ? '100ms' : '50ms' }}
                                        aria-label="Agregar viaje con IA"
                                    >
                                        <MailIcon className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                                    </button>
                                    <span className="absolute bottom-1/2 translate-y-1/2 right-full mr-3 px-2 py-1 bg-slate-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"> Con IA </span>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                            className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                            aria-haspopup="true" aria-expanded={isFabMenuOpen}
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