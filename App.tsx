import React, { useState, useEffect, useMemo, useRef } from "react";
import type { Trip, Flight } from "./types";

import Header from "./components/Header";
import TripList from "./components/TripList";
import EmailImporter from "./components/EmailImporter";
import CostSummary from "./components/CostSummary";
import CalendarView from "./components/CalendarView";
import NextTripCard from "./components/NextTripCard";
import QuickAddModal from "./components/QuickAddModal";
import AirportModeView from "./components/AirportModeView";
import LoginScreen from "./components/LoginScreen";
import { FullScreenLoader } from "./components/Spinner";

// IMPORTS INDIVIDUALES (evita error TS2307 en Netlify/Linux)
import { PlusCircleIcon } from "./components/icons/PlusCircleIcon";
import { ListBulletIcon } from "./components/icons/ListBulletIcon";
import { CalendarDaysIcon } from "./components/icons/CalendarDaysIcon";
import { CalculatorIcon } from "./components/icons/CalculatorIcon";
import { PencilSquareIcon } from "./components/icons/PencilSquareIcon";
import { MailIcon } from "./components/icons/MailIcon";
import { InformationCircleIcon } from "./components/icons/InformationCircleIcon";
import { ClockIcon } from "./components/icons/ClockIcon";

import { deleteBoardingPassesForTrip } from "./services/db";

// ✅ normalización ida/vuelta (tu lógica)
import { normalizeTripFlights } from "./services/tripLeg";

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

const safeDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const daysBetween = (
  aIso?: string | null,
  bIso?: string | null
): number | null => {
  const a = safeDate(aIso);
  const b = safeDate(bIso);
  if (!a || !b) return null;
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
};

const pickOldestIso = (a?: string | null, b?: string | null): string | null => {
  const da = safeDate(a || null);
  const db = safeDate(b || null);
  if (!da && !db) return null;
  if (da && !db) return a || null;
  if (!da && db) return b || null;
  return da!.getTime() <= db!.getTime() ? a || null : b || null;
};

/**
 * Define si un Trip es one-way (solo ida o solo vuelta),
 * pero usando normalización (no “qué campo existe”).
 */
const getOneWayLeg = (trip: Trip): "ida" | "vuelta" | null => {
  const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
  if (idaFlight && !vueltaFlight) return "ida";
  if (vueltaFlight && !idaFlight) return "vuelta";
  return null;
};

const isRoundTrip = (trip: Trip): boolean => {
  const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
  return !!idaFlight && !!vueltaFlight;
};

/* ------------------------------------------------------------------ */
/* Auth Error Screen                                                    */
/* ------------------------------------------------------------------ */

const AuthErrorScreen: React.FC<{
  error: { message?: string; links?: { url: string; text: string }[] };
}> = ({ error }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
    <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-6 rounded-xl shadow">
      <InformationCircleIcon className="w-10 h-10 mx-auto text-red-500" />
      <h1 className="mt-4 text-2xl font-bold">Error de Autenticación</h1>
      {error.message && <p className="mt-2 text-sm opacity-80">{error.message}</p>}

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

  // Agrupamiento manual (modo selección)
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
  const [isInstallBannerVisible, setIsInstallBannerVisible] = useState(false);

  // refs
  const processingRef = useRef(false);

  /* -------------------- config: ventana temporal auto-agrupado -------------------- */
  // Ajustable: si querés más estricto, bajalo (ej 7-10 días). Si querés más flexible, subilo (ej 30-45).
  const AUTO_GROUP_WINDOW_DAYS = 21;

  /* -------------------- auth -------------------- */

  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      try {
        if (currentUser) await currentUser.getIdToken(true);
        setAuthRuntimeError(null);
      } catch (e: any) {
        const msg = e?.message || "Auth error";
        const isHttpError =
          e?.code === "auth/network-request-failed" ||
          msg.includes("403") ||
          msg.includes("securetoken") ||
          msg.includes("API_KEY_HTTP_REFERRER_BLOCKED");

        if (isHttpError && projectId) {
          setAuthRuntimeError({
            message: msg,
            links: [
              {
                url: `https://console.cloud.google.com/apis/credentials?project=${projectId}`,
                text: "Revisar Restricciones de API Key",
              },
            ],
          });
        } else {
          setAuthRuntimeError({ message: msg });
        }
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

    return onSnapshot(
      q,
      (snap) => {
        const list: Trip[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setTrips(list);
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
      }
    );
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

  /* -------------------- PWA install prompt -------------------- */

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setIsInstallBannerVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") setIsInstallBannerVisible(false);
    setInstallPromptEvent(null);
  };

  /* -------------------- actions -------------------- */

  const onDeleteTrip = async (tripId: string) => {
    if (!user || !db) return;
    if (!window.confirm("¿Estás seguro de que deseas eliminar este viaje?"))
      return;

    await deleteDoc(doc(db, "users", user.uid, "trips", tripId));
    await deleteBoardingPassesForTrip(user.uid, tripId);
  };

  /**
   * Merge core: dado source (one-way) y target (one-way),
   * arma un viaje ida/vuelta y lo persiste como:
   * - updateDoc sobre uno de los docs
   * - deleteDoc del otro
   *
   * Nota: admite que uno de los "trips" todavía no exista en Firestore
   * (lo representamos como draftFake con id "__draft__"), en cuyo caso
   * mergea creando/updating sobre el existente.
   */
  const mergeTwoTrips = async (source: Trip, target: Trip) => {
    if (!user || !db) return;

    const sNorm = normalizeTripFlights(source);
    const tNorm = normalizeTripFlights(target);

    const sLeg = getOneWayLeg(source);
    const tLeg = getOneWayLeg(target);

    // Guardrail: solo mergeamos si realmente son complementarios (ida + vuelta)
    if (!sLeg || !tLeg || sLeg === tLeg) return;

    const idaFlight = sLeg === "ida" ? sNorm.idaFlight : tNorm.idaFlight;
    const vueltaFlight = sLeg === "vuelta" ? sNorm.vueltaFlight : tNorm.vueltaFlight;

    if (!idaFlight || !vueltaFlight) return;

    const mergedPurchaseDate =
      pickOldestIso(source.purchaseDate || null, target.purchaseDate || null) ||
      idaFlight.departureDateTime ||
      new Date().toISOString();

    // Si target es "draft" (no existe en Firestore), siempre mantenemos source.
    const targetIsDraft = target.id === "__draft__";

    // Elegimos “keep” como el más viejo por createdAt (si existe), para estabilidad visual.
    // Si target es draft, keep=source.
    const keep = targetIsDraft
      ? source
      : (safeDate(source.createdAt || null)?.getTime() ?? Infinity) <=
        (safeDate(target.createdAt || null)?.getTime() ?? Infinity)
      ? source
      : target;

    const remove = keep.id === source.id ? target : source;

    // Caso A: keep existe en Firestore seguro (o sea, keep no es draft)
    await updateDoc(doc(db, "users", user.uid, "trips", keep.id), {
      departureFlight: idaFlight,
      returnFlight: vueltaFlight,
      purchaseDate: mergedPurchaseDate,
      // createdAt NO lo tocamos: mantenemos el del doc “keep”
    });

    // Caso B: si remove existe en Firestore, lo borramos.
    // Si remove es draft, no hay nada que borrar.
    if (remove.id !== "__draft__") {
      await deleteDoc(doc(db, "users", user.uid, "trips", remove.id));
      await deleteBoardingPassesForTrip(user.uid, remove.id);
    }
  };

  /**
   * Agregar viaje:
   * - Primero intentamos auto-merge SOLO en el momento de alta.
   * - Si no hay match, guardamos el doc nuevo normalmente.
   */
  const onAddTrip = async (tripData: Omit<Trip, "id" | "createdAt">) => {
    if (!user || !db) return;

    const nowIso = new Date().toISOString();

    // Evitar doble ejecución accidental (doble click, etc.)
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const draftFake: Trip = {
        id: "__draft__",
        createdAt: nowIso,
        purchaseDate: tripData.purchaseDate || nowIso,
        departureFlight: tripData.departureFlight ?? null,
        returnFlight: tripData.returnFlight ?? null,
      };

      const draftLeg = getOneWayLeg(draftFake);

      // 1) intentamos merge automático SOLO si el nuevo es one-way
      if (draftLeg) {
        let bestMatch: { trip: Trip; score: number } | null = null;

        for (const existing of trips) {
          if (isRoundTrip(existing)) continue;

          const legA = getOneWayLeg(existing);
          if (!legA) continue;

          // complementarios
          if (legA === draftLeg) continue;

          const nA = normalizeTripFlights(existing);
          const nB = normalizeTripFlights(draftFake);

          const fA = legA === "ida" ? nA.idaFlight : nA.vueltaFlight;
          const fB = draftLeg === "ida" ? nB.idaFlight : nB.vueltaFlight;

          const d = daysBetween(
            fA?.departureDateTime ?? null,
            fB?.departureDateTime ?? null
          );

          if (d != null && d <= AUTO_GROUP_WINDOW_DAYS) {
            if (!bestMatch || d < bestMatch.score) {
              bestMatch = { trip: existing, score: d };
            }
          }
        }

        if (bestMatch) {
          // merge automático: existing + draft
          await mergeTwoTrips(bestMatch.trip, draftFake);

          setIsModalOpen(false);
          setIsQuickAddModalOpen(false);
          return;
        }
      }

      // 2) si no hubo merge, guardamos normal
      await addDoc(collection(db, "users", user.uid, "trips"), {
        ...tripData,
        createdAt: nowIso,
        purchaseDate: tripData.purchaseDate || nowIso,
      });

      setIsModalOpen(false);
      setIsQuickAddModalOpen(false);
    } finally {
      processingRef.current = false;
    }
  };

  /**
   * Desagrupar: si un trip tiene ida y vuelta, lo separa en 2 docs.
   */
  const onSplitTrip = async (trip: Trip) => {
    if (!user || !db) return;
    const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);

    if (!idaFlight || !vueltaFlight) return;

    if (
      !window.confirm(
        "Esto separará el viaje en dos tramos (Ida y Vuelta). ¿Continuar?"
      )
    ) {
      return;
    }

    // Crear dos nuevos trips (uno por tramo) y borrar el original
    const now = new Date().toISOString();
    const purchaseDate = trip.purchaseDate || now;

    await addDoc(collection(db, "users", user.uid, "trips"), {
      departureFlight: idaFlight,
      returnFlight: null,
      purchaseDate,
      createdAt: now,
    });

    await addDoc(collection(db, "users", user.uid, "trips"), {
      departureFlight: null,
      returnFlight: vueltaFlight,
      purchaseDate,
      createdAt: now,
    });

    await deleteDoc(doc(db, "users", user.uid, "trips", trip.id));
    await deleteBoardingPassesForTrip(user.uid, trip.id);

    // Cerrar modo agrupamiento por si estaba activo
    setGroupingState({ active: false, sourceTrip: null });
  };

  const onStartGrouping = (trip: Trip) => {
    // Solo permitimos iniciar si es un tramo único (one-way)
    if (!getOneWayLeg(trip)) return;
    setGroupingState({ active: true, sourceTrip: trip });
  };

  const onConfirmGrouping = async (targetTrip: Trip) => {
    if (!groupingState.active || !groupingState.sourceTrip) return;
    const sourceTrip = groupingState.sourceTrip;

    try {
      await mergeTwoTrips(sourceTrip, targetTrip);
    } catch (e) {
      console.error("Error merging trips:", e);
      alert("No se pudo agrupar. Revisá consola para más detalle.");
    } finally {
      setGroupingState({ active: false, sourceTrip: null });
    }
  };

  /* ------------------------------------------------------------------ */
  /* IMPORTANT: useMemo SIEMPRE ANTES de cualquier return condicional     */
  /* ------------------------------------------------------------------ */

  const futureTrips = useMemo(() => {
    if (!trips?.length) return [];
    const now = new Date();

    return [...trips]
      .filter((t) => {
        const end = getTripEndDate(t);
        return !!end && end > now;
      })
      .sort((a, b) => {
        const sa = getTripStartDate(a)?.getTime() || 0;
        const sb = getTripStartDate(b)?.getTime() || 0;
        return sa - sb;
      });
  }, [trips]);

  const nextTrip = futureTrips[0] ?? null;

  const nextTripFlight = useMemo(() => {
    if (!nextTrip) return null;
    return nextTrip.departureFlight || nextTrip.returnFlight || null;
  }, [nextTrip]);

  const nextTripFlightType = useMemo<"ida" | "vuelta">(() => {
    if (!nextTrip) return "ida";
    return nextTrip.departureFlight ? "ida" : "vuelta";
  }, [nextTrip]);

  const filteredTrips = useMemo(() => {
    if (!trips?.length) return [];
    const now = new Date();

    return trips.filter((t) => {
      const s = getTripStartDate(t);
      const e = getTripEndDate(t);

      if (listFilter === "future") return !!e && e >= now;
      if (listFilter === "completed") return !!e && e < now;
      if (listFilter === "currentMonth")
        return (
          !!s &&
          s.getMonth() === now.getMonth() &&
          s.getFullYear() === now.getFullYear()
        );

      return true;
    });
  }, [trips, listFilter]);

  /* -------------------- render guards (DESPUÉS de hooks) -------------------- */

  if (!isFirebaseInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 text-center">
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

        {isInstallBannerVisible && (
          <div className="mb-4">
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700"
            >
              Instalar App
            </button>
            <button
              onClick={() => setIsInstallBannerVisible(false)}
              className="ml-2 px-4 py-2 rounded bg-slate-200 dark:bg-slate-700"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-center mb-6">
          <div className="grid grid-cols-3 gap-1 bg-slate-200 dark:bg-slate-700 p-1 rounded-xl w-full max-w-md">
            <button
              onClick={() => setView("list")}
              className={`py-2 rounded-lg text-sm font-semibold ${
                view === "list" ? "bg-white dark:bg-slate-800" : "opacity-80"
              }`}
            >
              <span className="inline-flex items-center justify-center">
                <ListBulletIcon className="w-5 h-5 mr-1.5" /> Lista
              </span>
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`py-2 rounded-lg text-sm font-semibold ${
                view === "calendar"
                  ? "bg-white dark:bg-slate-800"
                  : "opacity-80"
              }`}
            >
              <span className="inline-flex items-center justify-center">
                <CalendarDaysIcon className="w-5 h-5 mr-1.5" /> Calendario
              </span>
            </button>
            <button
              onClick={() => setView("costs")}
              className={`py-2 rounded-lg text-sm font-semibold ${
                view === "costs" ? "bg-white dark:bg-slate-800" : "opacity-80"
              }`}
            >
              <span className="inline-flex items-center justify-center">
                <CalculatorIcon className="w-5 h-5 mr-1.5" /> Costos
              </span>
            </button>
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

            {/* Filter chips */}
            <div className="flex overflow-x-auto space-x-2 pb-2 mb-4">
              {filterOptions.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setListFilter(o.key)}
                  className={`px-4 py-1.5 rounded-full text-sm border ${
                    listFilter === o.key
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "border-slate-300 dark:border-slate-600 opacity-80"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <TripList
              trips={filteredTrips}
              onDeleteTrip={onDeleteTrip}
              onSplitTrip={onSplitTrip}
              listFilter={listFilter}
              nextTripId={nextTrip?.id || null}
              userId={user.uid}
              groupingState={groupingState}
              onStartGrouping={onStartGrouping}
              onConfirmGrouping={onConfirmGrouping}
            />
          </>
        )}

        {view === "calendar" && <CalendarView trips={trips} />}
        {view === "costs" && <CostSummary trips={trips} />}

        {/* FAB */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end space-y-3">
          {isFabMenuOpen && (
            <>
              <button
                onClick={() => {
                  setIsQuickAddModalOpen(true);
                  setIsFabMenuOpen(false);
                }}
                className="flex items-center space-x-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 transition-transform hover:scale-105"
              >
                <PencilSquareIcon className="w-5 h-5" />
                <span className="font-semibold text-sm">Manual</span>
              </button>

              <button
                onClick={() => {
                  setIsModalOpen(true);
                  setIsFabMenuOpen(false);
                }}
                className="flex items-center space-x-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 transition-transform hover:scale-105"
              >
                <MailIcon className="w-5 h-5" />
                <span className="font-semibold text-sm">Importar Email</span>
              </button>
            </>
          )}

          <button
            onClick={() => setIsFabMenuOpen((v) => !v)}
            className={`p-4 rounded-full shadow-2xl text-white transition-transform duration-300 ${
              isFabMenuOpen
                ? "bg-slate-600 rotate-45"
                : "bg-indigo-600 hover:scale-110"
            }`}
            aria-label="Agregar viaje"
          >
            <PlusCircleIcon className="w-8 h-8" />
          </button>
        </div>

        {isModalOpen && (
          <EmailImporter
            onClose={() => setIsModalOpen(false)}
            onAddTrip={onAddTrip}
            apiKey={""}
            onInvalidApiKey={() => {}}
          />
        )}

        {isQuickAddModalOpen && (
          <QuickAddModal
            onClose={() => setIsQuickAddModalOpen(false)}
            onAddTrip={onAddTrip}
          />
        )}
      </div>
    </div>
  );
};

export default App;
