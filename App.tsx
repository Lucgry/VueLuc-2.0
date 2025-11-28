
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { deleteBoardingPassesForTrip, getBoardingPass, saveBoardingPass, deleteBoardingPass, moveBoardingPass } from './services/db';
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

const getFlightFingerprint = (flight: Flight | null): string | null => {
  if (!flight || !flight.flightNumber || !flight.departureDateTime || !flight.departureAirportCode || !flight.arrivalAirportCode) {
    return null;
  }
  // Un vuelo se identifica de forma única por su número, fecha/hora de salida y ruta.
  return `${flight.flightNumber.trim().toUpperCase()}-${flight.departureDateTime}-${flight.departureAirportCode}-${flight.arrivalAirportCode}`;
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
  const [groupingState, setGroupingState] = useState<{ active: boolean; sourceTrip: Trip | null }>({ active: false, sourceTrip: null });
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
  
  const processingRef = useRef(false);
  const duplicateCleanupRun = useRef(false);

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

  const mergeTrips = useCallback(async (idaTrip: Trip, vueltaTrip: Trip) => {
    if (!user || !db) return;
    try {
      const updatedData: Partial<Omit<Trip, 'id' | 'createdAt'>> = {
        departureFlight: idaTrip.departureFlight,
        returnFlight: vueltaTrip.returnFlight,
      };

      if (idaTrip.purchaseDate && vueltaTrip.purchaseDate) {
        updatedData.purchaseDate = new Date(idaTrip.purchaseDate) < new Date(vueltaTrip.purchaseDate) ? idaTrip.purchaseDate : vueltaTrip.purchaseDate;
      } else {
        updatedData.purchaseDate = idaTrip.purchaseDate || vueltaTrip.purchaseDate;
      }

      const idaTripRef = doc(db, 'users', user.uid, 'trips', idaTrip.id);
      const vueltaTripRef = doc(db, 'users', user.uid, 'trips', vueltaTrip.id);

      await updateDoc(idaTripRef, updatedData);

      const vueltaPass = await getBoardingPass(user.uid, vueltaTrip.id, 'vuelta');
      if (vueltaPass.exists && vueltaPass.file) {
        await saveBoardingPass(user.uid, idaTrip.id, 'vuelta', vueltaPass.file);
      }
      
      await deleteDoc(vueltaTripRef);

    } catch (error) {
      console.error("Error al fusionar viajes:", error);
      throw new Error("Ocurrió un error al fusionar los viajes.");
    }
  }, [user]);
  
  const handleSplitTrip = useCallback(async (trip: Trip) => {
      if (!user || !db) return;
      if (!trip.departureFlight || !trip.returnFlight) {
          alert("Este viaje no se puede desagrupar porque no tiene ambos tramos (Ida y Vuelta).");
          return;
      }
      
      const confirmed = window.confirm("¿Deseas separar este viaje en dos tarjetas individuales? (Ida y Vuelta se separarán)");
      if (!confirmed) return;

      try {
          // 1. Create new trip for the return flight (Vuelta)
          const tripsCollectionRef = collection(db, 'users', user.uid, 'trips');
          
          // Ensure no undefined values are passed to Firestore
          const purchaseDate = trip.purchaseDate || null;

          const newVueltaTripRef = await addDoc(tripsCollectionRef, {
              departureFlight: null,
              returnFlight: trip.returnFlight,
              purchaseDate: purchaseDate, 
              createdAt: trip.createdAt || new Date().toISOString(),
          });
          
          // 2. Move Boarding Pass if it exists (Vuelta pass on old trip -> Vuelta pass on new trip)
          await moveBoardingPass(user.uid, trip.id, newVueltaTripRef.id, 'vuelta');

          // 3. Update original trip to remove return flight
          const originalTripRef = doc(db, 'users', user.uid, 'trips', trip.id);
          await updateDoc(originalTripRef, {
              returnFlight: null,
          });
          
      } catch (error) {
          console.error("Error splitting trip:", error);
          alert("Ocurrió un error al separar el viaje.");
      }

  }, [user]);

  const runAutomaticGrouping = useCallback(async (currentTrips: Trip[]) => {
      if (!user || !db || processingRef.current) return;

      const singleLegs = currentTrips.filter(t => (!!t.departureFlight) !== (!!t.returnFlight));
      if (singleLegs.length < 2) return;

      processingRef.current = true;
      
      const sortedLegs: Trip[] = singleLegs.sort((a, b) => {
          const dateA = getTripStartDate(a);
          const dateB = getTripStartDate(b);
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateA.getTime() - dateB.getTime();
      });

      const unpairedLegs: { trip: Trip; paired: boolean }[] = sortedLegs.map(trip => ({ trip, paired: false }));

      for (let i = 0; i < unpairedLegs.length; i++) {
          if (unpairedLegs[i].paired) continue;

          const currentLeg = unpairedLegs[i].trip;
          const isIda = !!currentLeg.departureFlight;

          if (isIda) {
              const nextLegIndex = i + 1;
              if (nextLegIndex < unpairedLegs.length && !unpairedLegs[nextLegIndex].paired) {
                  const nextLeg = unpairedLegs[nextLegIndex].trip;
                  const isVuelta = !!nextLeg.returnFlight;

                  if (isVuelta) {
                      console.log(`Emparejando IDA ${currentLeg.id} con VUELTA ${nextLeg.id}`);
                      await mergeTrips(currentLeg, nextLeg);
                      unpairedLegs[i].paired = true;
                      unpairedLegs[nextLegIndex].paired = true;
                  }
              }
          }
      }
      
      processingRef.current = false;
  }, [user, db, mergeTrips]);


  // Firestore data loading effect
  useEffect(() => {
    if (!user || !db || authRuntimeError) {
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
      runAutomaticGrouping(tripsFromFirestore);
    }, (error) => {
        console.error("Error fetching trips from Firestore:", error);
    });

    return () => unsubscribe();
  }, [user, authRuntimeError, runAutomaticGrouping]);

  // One-time cleanup for duplicate flights
  useEffect(() => {
    if (!user || !db || trips.length === 0 || duplicateCleanupRun.current) {
        return;
    }

    const runDuplicateCleanup = async () => {
        console.log("Iniciando limpieza de vuelos duplicados...");
        duplicateCleanupRun.current = true; // Mark as run to prevent re-execution

        const seenFingerprints = new Set<string>();
        const promises: Promise<void>[] = [];
        let duplicatesFound = 0;

        const sortedForCleanup = [...trips].sort((a, b) => 
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        );

        for (const trip of sortedForCleanup) {
            const tripRef = doc(db!, 'users', user.uid, 'trips', trip.id);
            let isModified = false;
            const updates: { departureFlight: Flight | null; returnFlight: Flight | null } = {
                departureFlight: trip.departureFlight,
                returnFlight: trip.returnFlight,
            };

            if (updates.departureFlight) {
                const fingerprint = getFlightFingerprint(updates.departureFlight);
                if (fingerprint && seenFingerprints.has(fingerprint)) {
                    updates.departureFlight = null;
                    isModified = true;
                    duplicatesFound++;
                } else if (fingerprint) {
                    seenFingerprints.add(fingerprint);
                }
            }

            if (updates.returnFlight) {
                const fingerprint = getFlightFingerprint(updates.returnFlight);
                if (fingerprint && seenFingerprints.has(fingerprint)) {
                    updates.returnFlight = null;
                    isModified = true;
                    duplicatesFound++;
                } else if (fingerprint) {
                    seenFingerprints.add(fingerprint);
                }
            }

            if (isModified) {
                if (!updates.departureFlight && !updates.returnFlight) {
                    promises.push(deleteDoc(tripRef));
                } else {
                    promises.push(updateDoc(tripRef, updates));
                }
            }
        }
        
        if (promises.length > 0) {
            await Promise.all(promises);
            console.log(`Limpieza completada: ${duplicatesFound} duplicados eliminados.`);
        }
    };
    
    runDuplicateCleanup();
  }, [user, db, trips]);

  const onStartGrouping = (trip: Trip) => {
      setGroupingState({ active: true, sourceTrip: trip });
  };

  const onConfirmGrouping = async (targetTrip: Trip) => {
      const sourceTrip = groupingState.sourceTrip;
      if (!sourceTrip) return;
      
      // Determine which is Ida and which is Vuelta
      let idaTrip: Trip | null = null;
      let vueltaTrip: Trip | null = null;

      if (sourceTrip.departureFlight) idaTrip = sourceTrip;
      else if (sourceTrip.returnFlight) vueltaTrip = sourceTrip;

      if (targetTrip.departureFlight) idaTrip = targetTrip;
      else if (targetTrip.returnFlight) vueltaTrip = targetTrip;

      if (idaTrip && vueltaTrip) {
          await mergeTrips(idaTrip, vueltaTrip);
      } else {
          alert("Debes seleccionar un viaje compatible (Ida + Vuelta).");
      }
      setGroupingState({ active: false, sourceTrip: null });
  };

  const onAddTrip = async (tripData: Omit<Trip, 'id' | 'createdAt'>) => {
      if (!user) return;
      const tripsCollectionRef = collection(db, 'users', user.uid, 'trips');
      await addDoc(tripsCollectionRef, {
          ...tripData,
          createdAt: new Date().toISOString(),
          purchaseDate: tripData.purchaseDate || new Date().toISOString()
      });
      setIsModalOpen(false);
      setIsQuickAddModalOpen(false);
  };

  const onDeleteTrip = async (tripId: string) => {
      if (!user || !db) return;
      if (window.confirm('¿Estás seguro de que deseas eliminar este viaje?')) {
          await deleteDoc(doc(db, 'users', user.uid, 'trips', tripId));
          await deleteBoardingPassesForTrip(user.uid, tripId);
      }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  // Initial theme application
  useEffect(() => {
     document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleApiKeySave = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setApiKey(key);
  };
  
  // Install PWA Logic
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setIsInstallBannerVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    installPromptEvent.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        setIsInstallBannerVisible(false);
      }
      setInstallPromptEvent(null);
    });
  };

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
    return <ApiKeySetup onKeySave={handleApiKeySave} />;
  }

  // Determine Next Trip for "NextTripCard" (exclude completed)
  const futureTrips = trips.filter(trip => {
      const end = getTripEndDate(trip);
      return end && end > new Date();
  }).sort((a, b) => {
      const startA = getTripStartDate(a);
      const startB = getTripStartDate(b);
      return (startA?.getTime() || 0) - (startB?.getTime() || 0);
  });
  const nextTrip = futureTrips[0];
  const nextTripFlight = nextTrip ? (nextTrip.departureFlight || nextTrip.returnFlight) : null;
  const nextTripFlightType = nextTrip && nextTrip.departureFlight ? 'ida' : 'vuelta';


  // Explicitly type the useMemo results and variables to prevent 'never' inference
  const filteredTrips = useMemo<Trip[]>(() => {
      return trips.filter(trip => {
          const startDate = getTripStartDate(trip);
          const endDate = getTripEndDate(trip);
          const now = new Date();

          if (listFilter === 'future') {
              return endDate && endDate >= now;
          }
          if (listFilter === 'completed') {
              return endDate && endDate < now;
          }
          if (listFilter === 'currentMonth') {
              return startDate && startDate.getMonth() === now.getMonth() && startDate.getFullYear() === now.getFullYear();
          }
          return true;
      });
  }, [trips, listFilter]);

  const sortedTrips = useMemo<Trip[]>(() => {
      return [...filteredTrips].sort((a, b) => {
          const dateA = getTripStartDate(a);
          const dateB = getTripStartDate(b);
          
          if (!dateA) return 1;
          if (!dateB) return -1;
          
          // For completed trips, sort descending (newest first)
          // For future trips, sort ascending (soonest first)
          if (listFilter === 'completed') {
              return dateB.getTime() - dateA.getTime();
          }
          return dateA.getTime() - dateB.getTime();
      });
  }, [filteredTrips, listFilter]);
  
  // Explicit nextTripInfo to ensure type safety
  const nextTripInfo = useMemo<{ id: string | null }>(() => ({
      id: nextTrip ? nextTrip.id : null
  }), [nextTrip]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'dark' : ''}`}>
       <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-24">
         <Header 
            theme={theme} 
            onToggleTheme={toggleTheme} 
            isAirportMode={isAirportMode} 
            onToggleAirportMode={() => setIsAirportMode(true)}
        />
        
        {isAirportMode && nextTrip && nextTripFlight && (
            <AirportModeView 
                trip={nextTrip} 
                flight={nextTripFlight} 
                flightType={nextTripFlightType}
                onClose={() => setIsAirportMode(false)}
                userId={user.uid}
            />
        )}

        {isInstallBannerVisible && (
            <InstallBanner onInstall={handleInstallClick} onDismiss={() => setIsInstallBannerVisible(false)} />
        )}
        
        {/* Navigation - Segmented Control */}
        <div className="flex justify-center mb-6">
            <div className="bg-slate-200 dark:bg-slate-700/50 p-1 rounded-xl grid grid-cols-3 gap-1 w-full max-w-md shadow-inner">
                <button onClick={() => setView('list')} className={`flex items-center justify-center py-2 rounded-lg text-sm font-semibold transition-all ${view === 'list' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`}>
                    <ListBulletIcon className="w-5 h-5 mr-1.5"/> Lista
                </button>
                <button onClick={() => setView('calendar')} className={`flex items-center justify-center py-2 rounded-lg text-sm font-semibold transition-all ${view === 'calendar' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`}>
                    <CalendarDaysIcon className="w-5 h-5 mr-1.5"/> Calendario
                </button>
                <button onClick={() => setView('costs')} className={`flex items-center justify-center py-2 rounded-lg text-sm font-semibold transition-all ${view === 'costs' ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-slate-600/50'}`}>
                    <CalculatorIcon className="w-5 h-5 mr-1.5"/> Costos
                </button>
            </div>
        </div>

        {view === 'list' && (
            <>
                {nextTrip && nextTripFlight && listFilter === 'future' && (
                    <NextTripCard flight={nextTripFlight} flightType={nextTripFlightType} />
                )}
                
                {/* Filter Chips - Horizontal Scroll */}
                <div className="flex overflow-x-auto space-x-2 pb-2 mb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                    {filterOptions.map(option => (
                        <button
                            key={option.key}
                            onClick={() => setListFilter(option.key)}
                            className={`flex-shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${listFilter === option.key ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-transparent border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <TripList 
                    trips={sortedTrips} 
                    onDeleteTrip={onDeleteTrip} 
                    onSplitTrip={handleSplitTrip}
                    listFilter={listFilter}
                    nextTripId={nextTripInfo.id}
                    userId={user.uid}
                    groupingState={groupingState}
                    onStartGrouping={onStartGrouping}
                    onConfirmGrouping={onConfirmGrouping}
                />
            </>
        )}

        {view === 'calendar' && <CalendarView trips={trips} />}
        {view === 'costs' && <CostSummary trips={trips} />}

        {/* Floating Action Button (FAB) */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end space-y-3">
             {isFabMenuOpen && (
                <>
                    <button 
                        onClick={() => { setIsQuickAddModalOpen(true); setIsFabMenuOpen(false); }}
                        className="flex items-center space-x-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 transition-transform hover:scale-105"
                    >
                        <PencilSquareIcon className="w-5 h-5 text-sky-500" />
                        <span className="font-semibold text-sm">Manual</span>
                    </button>
                    <button 
                        onClick={() => { setIsModalOpen(true); setIsFabMenuOpen(false); }}
                        className="flex items-center space-x-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 transition-transform hover:scale-105"
                    >
                        <MailIcon className="w-5 h-5 text-indigo-500" />
                        <span className="font-semibold text-sm">Importar Email</span>
                    </button>
                </>
             )}
             <button
                onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                className={`p-4 rounded-full shadow-2xl text-white transition-transform duration-300 ${isFabMenuOpen ? 'bg-slate-600 rotate-45' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-110'}`}
                aria-label="Agregar viaje"
             >
                <PlusCircleIcon className="h-8 w-8" />
             </button>
        </div>

        {isModalOpen && (
          <EmailImporter 
            onClose={() => setIsModalOpen(false)} 
            onAddTrip={onAddTrip} 
            apiKey={apiKey}
            onInvalidApiKey={() => setApiKey('')}
          />
        )}
        
        {isQuickAddModalOpen && (
            <QuickAddModal onClose={() => setIsQuickAddModalOpen(false)} onAddTrip={onAddTrip} />
        )}
       </div>
    </div>
  );
};

export default App;
