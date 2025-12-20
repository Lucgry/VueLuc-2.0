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
  getDoc,
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

const SLA_CODE = "SLA";

// Ventana temporal para auto-agrupado (en días).
// Elegí un valor amplio: tu ejemplo puede ser > 60 días (dic → mar).
const AUTO_GROUP_WINDOW_DAYS = 180;

// Activa/desactiva el auto-agrupado server-side (Firestore).
const ENABLE_AUTO_GROUPING = true;

const safeUpper = (s: unknown) => String(s || "").toUpperCase().trim();

const toDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const daysBetween = (a: Date, b: Date): number => {
  const ms = Math.abs(b.getTime() - a.getTime());
  return ms / (1000 * 60 * 60 * 24);
};

const getTripStartDate = (trip: Trip): Date | null => {
  const d =
    trip.departureFlight?.departureDateTime ||
    trip.returnFlight?.departureDateTime;
  return toDate(d);
};

const getTripEndDate = (trip: Trip): Date | null => {
  const d =
    trip.returnFlight?.arrivalDateTime ||
    trip.departureFlight?.arrivalDateTime;
  return toDate(d);
};

const getSingleFlight = (trip: Trip): Flight | null => {
  return trip.departureFlight || trip.returnFlight || null;
};

const isOneWayTrip = (trip: Trip): boolean => {
  const hasOut = !!trip.departureFlight;
  const hasIn = !!trip.returnFlight;
  return hasOut !== hasIn;
};

const flightKey = (f: Flight): string => {
  return `${safeUpper(f.departureAirportCode)}-${safeUpper(f.arrivalAirportCode)}`;
};

const areInverseRoutes = (a: Flight, b: Flight): boolean => {
  return (
    safeUpper(a.departureAirportCode) === safeUpper(b.arrivalAirportCode) &&
    safeUpper(a.arrivalAirportCode) === safeUpper(b.departureAirportCode)
  );
};

const isArrivalToSalta = (f: Flight | null): boolean => {
  if (!f) return false;
  return safeUpper(f.arrivalAirportCode) === SLA_CODE;
};

const isDepartureFromSalta = (f: Flight | null): boolean => {
  if (!f) return false;
  return safeUpper(f.departureAirportCode) === SLA_CODE;
};

// Normaliza un trip de tramo único:
// - Si el único vuelo llega a SLA => debe ir en returnFlight (vuelta)
// - Si el único vuelo NO llega a SLA => debe ir en departureFlight (ida)
const normalizeOneWayTrip = (
  trip: Trip
): { normalized: Trip; changed: boolean } => {
  if (!isOneWayTrip(trip)) return { normalized: trip, changed: false };

  const f = getSingleFlight(trip);
  if (!f) return { normalized: trip, changed: false };

  const shouldBeReturn = isArrivalToSalta(f);

  // Caso: está guardado como departureFlight pero debería ser returnFlight
  if (shouldBeReturn && trip.departureFlight && !trip.returnFlight) {
    const normalized: Trip = {
      ...trip,
      departureFlight: null,
      returnFlight: trip.departureFlight,
    };
    return { normalized, changed: true };
  }

  // Caso: está guardado como returnFlight pero debería ser departureFlight
  if (!shouldBeReturn && trip.returnFlight && !trip.departureFlight) {
    const normalized: Trip = {
      ...trip,
      departureFlight: trip.returnFlight,
      returnFlight: null,
    };
    return { normalized, changed: true };
  }

  return { normalized: trip, changed: false };
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
      {error.message && (
        <p className="mt-2 text-sm opacity-80">{error.message}</p>
      )}

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
  const [isInstallBannerVisible, setIsInstallBannerVisible] = useState(false);

  // guards
  const processingRef = useRef(false);

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

  /* -------------------- CRUD actions -------------------- */

  const onDeleteTrip = async (tripId: string) => {
    if (!user || !db) return;
    if (!window.confirm("¿Estás seguro de que deseas eliminar este viaje?"))
      return;

    await deleteDoc(doc(db, "users", user.uid, "trips", tripId));
    await deleteBoardingPassesForTrip(user.uid, tripId);
  };

  const onAddTrip = async (tripData: Omit<Trip, "id" | "createdAt">) => {
    if (!user || !db) return;

    await addDoc(collection(db, "users", user.uid, "trips"), {
      ...tripData,
      createdAt: new Date().toISOString(),
      purchaseDate: tripData.purchaseDate || new Date().toISOString(),
    });

    setIsModalOpen(false);
    setIsQuickAddModalOpen(false);
  };

  /* ------------------------------------------------------------------ */
  /* Grouping: manual + auto                                             */
  /* ------------------------------------------------------------------ */

  const onStartGrouping = (trip: Trip) => {
    setGroupingState({ active: true, sourceTrip: trip });
  };

  const cancelGrouping = () => {
    setGroupingState({ active: false, sourceTrip: null });
  };

  const mergeTrips = async (a: Trip, b: Trip) => {
    if (!user || !db) return;

    // Normalizamos por si alguno está invertido
    const na = normalizeOneWayTrip(a).normalized;
    const nb = normalizeOneWayTrip(b).normalized;

    const fa = getSingleFlight(na);
    const fb = getSingleFlight(nb);
    if (!fa || !fb) return;

    // Determinar outbound/inbound por lógica robusta:
    // - outbound: el que sale de SLA (si existe)
    // - inbound: el que llega a SLA (si existe)
    // - fallback: por orden temporal (primero outbound)
    let outbound: Flight | null = null;
    let inbound: Flight | null = null;

    if (isDepartureFromSalta(fa)) outbound = fa;
    if (isDepartureFromSalta(fb)) outbound = outbound || fb;

    if (isArrivalToSalta(fa)) inbound = fa;
    if (isArrivalToSalta(fb)) inbound = inbound || fb;

    // Si no se pudo inferir, usar orden temporal
    if (!outbound || !inbound) {
      const da = toDate(fa.departureDateTime);
      const dbb = toDate(fb.departureDateTime);
      if (da && dbb) {
        if (da <= dbb) {
          outbound = outbound || fa;
          inbound = inbound || fb;
        } else {
          outbound = outbound || fb;
          inbound = inbound || fa;
        }
      } else {
        outbound = outbound || fa;
        inbound = inbound || fb;
      }
    }

    // Elegir el doc “principal” a mantener:
    // Mantener el que tenga menor startDate
    const aStart = getTripStartDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bStart = getTripStartDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    const keep = aStart <= bStart ? a : b;
    const remove = keep.id === a.id ? b : a;

    const keepRef = doc(db, "users", user.uid, "trips", keep.id);
    const removeRef = doc(db, "users", user.uid, "trips", remove.id);

    // Merge purchaseDate: el más antiguo disponible
    const keepPurchase = toDate((keep as any).purchaseDate)?.getTime();
    const removePurchase = toDate((remove as any).purchaseDate)?.getTime();
    const mergedPurchaseDate =
      keepPurchase && removePurchase
        ? new Date(Math.min(keepPurchase, removePurchase)).toISOString()
        : (keep as any).purchaseDate || (remove as any).purchaseDate || new Date().toISOString();

    await updateDoc(keepRef, {
      departureFlight: outbound,
      returnFlight: inbound,
      purchaseDate: mergedPurchaseDate,
    });

    await deleteDoc(removeRef);
    // Nota: si remove tenía boarding passes, hoy no los migramos automáticamente.
  };

  const onConfirmGrouping = async (targetTrip: Trip) => {
    if (!groupingState.active || !groupingState.sourceTrip) return;

    try {
      await mergeTrips(groupingState.sourceTrip, targetTrip);
    } catch (e) {
      console.error("Error grouping trips:", e);
      alert("No se pudo agrupar. Reintenta.");
    } finally {
      cancelGrouping();
    }
  };

  const onSplitTrip = async (trip: Trip) => {
    if (!user || !db) return;
    if (!trip.departureFlight || !trip.returnFlight) return;

    if (!window.confirm("¿Separar este viaje en dos tramos?")) return;

    try {
      const baseCreatedAt = (trip as any).createdAt || new Date().toISOString();
      const purchaseDate = (trip as any).purchaseDate || new Date().toISOString();

      // Crear dos nuevos trips (uno ida, uno vuelta) y borrar el original
      await addDoc(collection(db, "users", user.uid, "trips"), {
        departureFlight: trip.departureFlight,
        returnFlight: null,
        createdAt: baseCreatedAt,
        purchaseDate,
      });

      await addDoc(collection(db, "users", user.uid, "trips"), {
        departureFlight: null,
        returnFlight: trip.returnFlight,
        createdAt: baseCreatedAt,
        purchaseDate,
      });

      await deleteDoc(doc(db, "users", user.uid, "trips", trip.id));

      // Boarding passes del trip original quedan asociados a un id que ya no existe.
      // Por ahora los borramos para evitar basura.
      await deleteBoardingPassesForTrip(user.uid, trip.id);
    } catch (e) {
      console.error("Error splitting trip:", e);
      alert("No se pudo desagrupar. Reintenta.");
    }
  };

  // 1) Normalización automática de tramos mal clasificados (llega a SLA => vuelta)
  useEffect(() => {
    if (!user || !db || authRuntimeError) return;
    if (processingRef.current) return;

    const run = async () => {
      processingRef.current = true;
      try {
        const updates: Promise<void>[] = [];

        for (const t of trips) {
          if (!t?.id) continue;
          if (!isOneWayTrip(t)) continue;

          const { normalized, changed } = normalizeOneWayTrip(t);
          if (!changed) continue;

          const ref = doc(db, "users", user.uid, "trips", t.id);
          updates.push(
            updateDoc(ref, {
              departureFlight: normalized.departureFlight ?? null,
              returnFlight: normalized.returnFlight ?? null,
            }) as any
          );
        }

        if (updates.length) {
          await Promise.all(updates);
        }
      } catch (e) {
        console.error("Auto-normalization error:", e);
      } finally {
        processingRef.current = false;
      }
    };

    run();
  }, [trips, user, authRuntimeError]);

  // 2) Auto-agrupado: detecta pares inversos dentro de ventana temporal y los mergea
  useEffect(() => {
    if (!ENABLE_AUTO_GROUPING) return;
    if (!user || !db || authRuntimeError) return;
    if (processingRef.current) return;

    const run = async () => {
      processingRef.current = true;
      try {
        const oneWays = trips
          .filter((t) => isOneWayTrip(t))
          .map((t) => normalizeOneWayTrip(t).normalized);

        if (oneWays.length < 2) return;

        // Ordenar por fecha para hacer matching estable
        const sorted = [...oneWays].sort((a, b) => {
          const sa = getTripStartDate(a)?.getTime() ?? 0;
          const sb = getTripStartDate(b)?.getTime() ?? 0;
          return sa - sb;
        });

        const used = new Set<string>();

        for (let i = 0; i < sorted.length; i++) {
          const a = sorted[i];
          if (used.has(a.id)) continue;

          const fa = getSingleFlight(a);
          const da = fa ? toDate(fa.departureDateTime) : null;
          if (!fa || !da) continue;

          for (let j = i + 1; j < sorted.length; j++) {
            const b = sorted[j];
            if (used.has(b.id)) continue;

            const fb = getSingleFlight(b);
            const dbb = fb ? toDate(fb.departureDateTime) : null;
            if (!fb || !dbb) continue;

            // Reglas:
            // - rutas inversas
            // - ventana temporal
            // - idealmente la vuelta sale después de la ida (si se puede)
            if (!areInverseRoutes(fa, fb)) continue;

            const window = daysBetween(da, dbb);
            if (window > AUTO_GROUP_WINDOW_DAYS) continue;

            // Condición suave: intentamos que "ida" sea la más temprana
            // pero si vienen invertidos igual los mergeamos (mergeTrips decide).
            await mergeTrips(a, b);

            used.add(a.id);
            used.add(b.id);
            break;
          }
        }
      } catch (e) {
        console.error("Auto-grouping error:", e);
      } finally {
        processingRef.current = false;
      }
    };

    run();
  }, [trips, user, authRuntimeError]);

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
