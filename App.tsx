import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import type { Trip, Flight } from "./types";

import Header from "./components/Header";
import TripList from "./components/TripList";
import EmailImporter from "./components/EmailImporter";
import CostSummary from "./components/CostSummary";
import CalendarView from "./components/CalendarView";
import NextTripCard from "./components/NextTripCard";
import InstallBanner from "./components/InstallBanner";
import QuickAddModal from "./components/QuickAddModal";
import AirportModeView from "./components/AirportModeView";
import LoginScreen from "./components/LoginScreen";
import { FullScreenLoader } from "./components/Spinner";

import {
  PlusCircleIcon,
  ListBulletIcon,
  CalendarDaysIcon,
  CalculatorIcon,
  PencilSquareIcon,
  MailIcon,
  InformationCircleIcon,
  ClockIcon,
} from "./components/icons";

import {
  getBoardingPass,
  saveBoardingPass,
  moveBoardingPass,
  deleteBoardingPassesForTrip,
} from "./services/db";

import { onAuthStateChanged, User } from "firebase/auth";
import {
  db,
  auth,
  isFirebaseInitialized,
  firebaseInitializationError,
  projectId,
} from "./firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
} from "firebase/firestore";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type View = "list" | "calendar" | "costs";
type ListFilter = "future" | "completed" | "currentMonth" | "all";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const filterOptions: { key: ListFilter; label: string }[] = [
  { key: "future", label: "Futuros" },
  { key: "currentMonth", label: "Este Mes" },
  { key: "completed", label: "Completados" },
  { key: "all", label: "Todos" },
];

const getTripStartDate = (trip: Trip): Date | null => {
  const d =
    trip.departureFlight?.departureDateTime ||
    trip.returnFlight?.departureDateTime;
  return d ? new Date(d) : null;
};

const getTripEndDate = (trip: Trip): Date | null => {
  const d =
    trip.returnFlight?.arrivalDateTime ||
    trip.departureFlight?.arrivalDateTime;
  return d ? new Date(d) : null;
};

const getFlightFingerprint = (flight: Flight | null): string | null => {
  if (
    !flight ||
    !flight.flightNumber ||
    !flight.departureDateTime ||
    !flight.departureAirportCode ||
    !flight.arrivalAirportCode
  ) {
    return null;
  }
  return `${flight.flightNumber.trim().toUpperCase()}-${flight.departureDateTime}-${flight.departureAirportCode}-${flight.arrivalAirportCode}`;
};

/* ------------------------------------------------------------------ */
/* Auth Error Screen                                                    */
/* ------------------------------------------------------------------ */

const AuthErrorScreen: React.FC<{
  error: { links?: { url: string; text: string }[] };
}> = ({ error }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
    <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-6 rounded-xl shadow">
      <InformationCircleIcon className="w-10 h-10 mx-auto text-red-500" />
      <h1 className="mt-4 text-2xl font-bold">Error de Autenticación</h1>

      {error.links && (
        <div className="mt-6 space-y-3">
          {error.links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="block px-4 py-3 rounded bg-slate-200 dark:bg-slate-700"
            >
              {l.text}
            </a>
          ))}
        </div>
      )}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const App: React.FC = () => {
  /* -------------------- state & refs (SIEMPRE ARRIBA) -------------------- */

  const [trips, setTrips] = useState<Trip[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authRuntimeError, setAuthRuntimeError] = useState<{
    message: string;
    links?: { url: string; text: string }[];
  } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  const [view, setView] = useState<View>("list");
  const [listFilter, setListFilter] = useState<ListFilter>("future");

  const [isAirportMode, setIsAirportMode] = useState(false);
  const [groupingState, setGroupingState] = useState<{
    active: boolean;
    sourceTrip: Trip | null;
  }>({ active: false, sourceTrip: null });

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallBannerVisible, setIsInstallBannerVisible] =
    useState(false);

  const processingRef = useRef(false);
  const duplicateCleanupRun = useRef(false);

  /* -------------------- auth -------------------- */

  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      try {
        if (currentUser) await currentUser.getIdToken(true);
        setAuthRuntimeError(null);
      } catch (e: any) {
        setAuthRuntimeError({ message: e?.message || "Auth error" });
      } finally {
        setLoadingAuth(false);
      }
    });

    return () => unsub();
  }, []);

  /* -------------------- firestore load -------------------- */

  useEffect(() => {
    if (!user || !db || authRuntimeError) {
      setTrips([]);
      return;
    }

    const q = query(
      collection(db, "users", user.uid, "trips"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snap) => {
      const list: Trip[] = [];
      snap.forEach((d) =>
        list.push({ id: d.id, ...(d.data() as any) })
      );
      setTrips(list);
    });
  }, [user, authRuntimeError]);

  /* -------------------- theme -------------------- */

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => {
      const n = t === "light" ? "dark" : "light";
      localStorage.setItem("theme", n);
      return n;
    });
  };

  /* -------------------- render guards (DESPUÉS de hooks) -------------------- */

  if (!isFirebaseInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ClockIcon className="w-10 h-10 animate-pulse" />
        {firebaseInitializationError && (
          <p className="ml-3">{firebaseInitializationError.message}</p>
        )}
      </div>
    );
  }

  if (loadingAuth) return <FullScreenLoader />;
  if (authRuntimeError) return <AuthErrorScreen error={authRuntimeError} />;
  if (!user) return <LoginScreen />;

  /* -------------------- derived data -------------------- */

  const futureTrips = useMemo(
    () =>
      trips.filter((t) => {
        const end = getTripEndDate(t);
        return end && end > new Date();
      }),
    [trips]
  );

  const nextTrip = futureTrips[0];
  const nextTripFlight =
    nextTrip?.departureFlight || nextTrip?.returnFlight || null;
  const nextTripFlightType = nextTrip?.departureFlight ? "ida" : "vuelta";

  const filteredTrips = useMemo(() => {
    const now = new Date();
    return trips.filter((t) => {
      const s = getTripStartDate(t);
      const e = getTripEndDate(t);
      if (listFilter === "future") return e && e >= now;
      if (listFilter === "completed") return e && e < now;
      if (listFilter === "currentMonth")
        return (
          s &&
          s.getMonth() === now.getMonth() &&
          s.getFullYear() === now.getFullYear()
        );
      return true;
    });
  }, [trips, listFilter]);

  /* -------------------- UI -------------------- */

  return (
    <div className={`min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <div className="max-w-4xl mx-auto p-4 pb-24">
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

        <div className="flex justify-center mb-6">
          <div className="grid grid-cols-3 gap-1 bg-slate-200 dark:bg-slate-700 p-1 rounded-xl">
            <button onClick={() => setView("list")}>Lista</button>
            <button onClick={() => setView("calendar")}>Calendario</button>
            <button onClick={() => setView("costs")}>Costos</button>
          </div>
        </div>

        {view === "list" && (
          <>
            {nextTrip && nextTripFlight && listFilter === "future" && (
              <NextTripCard
                flight={nextTripFlight}
                flightType={nextTripFlightType}
              />
            )}

            <TripList
              trips={filteredTrips}
              onDeleteTrip={() => {}}
              onSplitTrip={() => {}}
              listFilter={listFilter}
              nextTripId={nextTrip?.id || null}
              userId={user.uid}
              groupingState={groupingState}
              onStartGrouping={() => {}}
              onConfirmGrouping={() => {}}
            />
          </>
        )}

        {view === "calendar" && <CalendarView trips={trips} />}
        {view === "costs" && <CostSummary trips={trips} />}

        {/* FAB */}
        <div className="fixed bottom-6 right-6">
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-4 rounded-full bg-indigo-600 text-white"
          >
            <PlusCircleIcon className="w-8 h-8" />
          </button>
        </div>

        {isModalOpen && (
          <EmailImporter
            onClose={() => setIsModalOpen(false)}
            onAddTrip={async () => {}}
          />
        )}

        {isQuickAddModalOpen && (
          <QuickAddModal
            onClose={() => setIsQuickAddModalOpen(false)}
            onAddTrip={async () => {}}
          />
        )}
      </div>
    </div>
  );
};

export default App;
