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

import { deleteBoardingPassesForTrip, moveBoardingPass } from "./services/db";
import {
  importTripsFromGmail,
  type GmailImportSettings,
} from "./services/gmailImport";
import {
  chooseBetterPaymentMethod,
  normalizePaymentMethod,
  shouldReplaceFlightPayment,
} from "./services/payment";

// ✅ normalización ida/vuelta (tu lógica)
import {
  DEFAULT_MAX_ROUND_TRIP_DAYS,
  getRoundTripGapDays,
  isValidRoundTripPair,
  normalizeTripFlights,
} from "./services/tripLeg";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from "firebase/auth";
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
  setDoc,
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
  const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
  const d = idaFlight?.departureDateTime || vueltaFlight?.departureDateTime;
  return d ? new Date(d) : null;
};

const getTripEndDate = (trip: Trip): Date | null => {
  const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
  const d =
    idaFlight && vueltaFlight && isValidRoundTripPair(idaFlight, vueltaFlight)
      ? vueltaFlight.arrivalDateTime || vueltaFlight.departureDateTime
      : idaFlight?.arrivalDateTime ||
        idaFlight?.departureDateTime ||
        vueltaFlight?.arrivalDateTime ||
        vueltaFlight?.departureDateTime;
  return d ? new Date(d) : null;
};

const safeDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
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

const normalizeFlightIdentityField = (value?: string | null): string =>
  (value || "").trim().toUpperCase();

const normalizeFlightNumber = (value?: string | null): string =>
  normalizeFlightIdentityField(value).replace(/[^A-Z0-9]/g, "");

const normalizeFlightDateTime = (value?: string | null): string => {
  const match = (value || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);

  return match ? `${match[1]}T${match[2]}` : "";
};

const getTripFlights = (trip: Trip): Flight[] => {
  const normalized = normalizeTripFlights(trip);
  const flights = [
    trip.departureFlight ?? null,
    trip.returnFlight ?? null,
    normalized.idaFlight ?? null,
    normalized.vueltaFlight ?? null,
  ].filter(Boolean) as Flight[];

  return flights.filter((flight, index) => flights.indexOf(flight) === index);
};

const flightMatchesIdentity = (candidate: Flight, existing: Flight): boolean => {
  const candidateFlightNumber = normalizeFlightNumber(candidate.flightNumber);
  const existingFlightNumber = normalizeFlightNumber(existing.flightNumber);
  const candidateDeparture = normalizeFlightDateTime(candidate.departureDateTime);
  const existingDeparture = normalizeFlightDateTime(existing.departureDateTime);
  const candidateOrigin = normalizeFlightIdentityField(candidate.departureAirportCode);
  const existingOrigin = normalizeFlightIdentityField(existing.departureAirportCode);
  const candidateDestination = normalizeFlightIdentityField(candidate.arrivalAirportCode);
  const existingDestination = normalizeFlightIdentityField(existing.arrivalAirportCode);

  if (
    !candidateFlightNumber ||
    !candidateDeparture ||
    !candidateOrigin ||
    !candidateDestination ||
    !existingFlightNumber ||
    !existingDeparture ||
    !existingOrigin ||
    !existingDestination
  ) {
    return false;
  }

  return (
    candidateFlightNumber === existingFlightNumber &&
    candidateDeparture === existingDeparture &&
    candidateOrigin === existingOrigin &&
    candidateDestination === existingDestination
  );
};

const flightAlreadyExists = (candidate: Flight, existingTrips: Trip[]): boolean =>
  existingTrips.some((trip) =>
    getTripFlights(trip).some((existingFlight) =>
      flightMatchesIdentity(candidate, existingFlight)
    )
  );

const normalizeFlightPayment = (flight: Flight | null): Flight | null => {
  if (!flight) return null;
  return {
    ...flight,
    paymentMethod: normalizePaymentMethod(flight.paymentMethod).label,
  };
};

const normalizeTripPayment = <T extends Omit<Trip, "id" | "createdAt">>(trip: T): T => ({
  ...trip,
  departureFlight: normalizeFlightPayment(trip.departureFlight),
  returnFlight: normalizeFlightPayment(trip.returnFlight),
});

const mergeFlightFinancialData = (existing: Flight, candidate: Flight): Flight => {
  const next: Flight = { ...existing };

  if ((next.cost == null || next.cost <= 0) && candidate.cost != null && candidate.cost > 0) {
    next.cost = candidate.cost;
  }

  if (
    shouldReplaceFlightPayment(
      next.paymentMethod,
      next.paymentSource ?? null,
      candidate.paymentMethod,
      candidate.paymentSource ?? candidate.source ?? null
    )
  ) {
    next.paymentMethod = chooseBetterPaymentMethod(next.paymentMethod, candidate.paymentMethod);
    next.paymentSource = candidate.paymentSource ?? candidate.source ?? null;
  } else {
    const currentPayment = normalizePaymentMethod(next.paymentMethod);
    const candidatePayment = normalizePaymentMethod(candidate.paymentMethod);
    if (
      currentPayment.detected &&
      candidatePayment.detected &&
      currentPayment.id !== candidatePayment.id &&
      candidatePayment.specificity >= currentPayment.specificity
    ) {
      console.warn("Conflicto de forma de pago; se conserva la existente", {
        existing: currentPayment,
        candidate: candidatePayment,
        flightNumber: existing.flightNumber,
        departureDateTime: existing.departureDateTime,
      });
    }
    next.paymentMethod =
      next.paymentSource === "manual"
        ? normalizePaymentMethod(next.paymentMethod).label
        : chooseBetterPaymentMethod(next.paymentMethod, candidate.paymentMethod);
  }

  return next;
};

const getInvalidRoundTripFlights = (
  trip: Trip
): { idaFlight: Flight; vueltaFlight: Flight } | null => {
  const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
  if (!idaFlight || !vueltaFlight) return null;
  return isValidRoundTripPair(idaFlight, vueltaFlight)
    ? null
    : { idaFlight, vueltaFlight };
};

const splitInvalidRoundTripsForDisplay = (sourceTrips: Trip[]): Trip[] =>
  sourceTrips.flatMap((trip) => {
    const invalid = getInvalidRoundTripFlights(trip);
    if (!invalid) return [trip];

    console.warn("Grupo invalido separado para render local", {
      tripId: trip.id,
      ida: invalid.idaFlight.departureDateTime,
      vuelta: invalid.vueltaFlight.departureDateTime,
    });

    return [
      {
        ...trip,
        departureFlight: invalid.idaFlight,
        returnFlight: null,
      },
      {
        ...trip,
        id: `${trip.id}__vuelta_split_pending`,
        departureFlight: null,
        returnFlight: invalid.vueltaFlight,
      },
    ];
  });

const getFlightDepartureMs = (flight?: Flight | null): number => {
  const d = safeDate(flight?.departureDateTime ?? null);
  return d?.getTime() ?? Number.POSITIVE_INFINITY;
};

const findPersistedOneWayPairs = (
  sourceTrips: Trip[],
  maxDays = DEFAULT_MAX_ROUND_TRIP_DAYS
): Array<{ idaTrip: Trip; vueltaTrip: Trip }> => {
  const oneWayTrips = sourceTrips
    .map((trip) => {
      const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
      const leg =
        idaFlight && !vueltaFlight
          ? "ida"
          : vueltaFlight && !idaFlight
          ? "vuelta"
          : null;
      const flight = leg === "ida" ? idaFlight : leg === "vuelta" ? vueltaFlight : null;
      return { trip, leg, flight };
    })
    .filter((entry): entry is { trip: Trip; leg: "ida" | "vuelta"; flight: Flight } =>
      !!entry.leg && !!entry.flight && !entry.trip.id.includes("__")
    )
    .sort((a, b) => getFlightDepartureMs(a.flight) - getFlightDepartureMs(b.flight));

  const usedTripIds = new Set<string>();
  const pairs: Array<{ idaTrip: Trip; vueltaTrip: Trip }> = [];

  for (const outbound of oneWayTrips) {
    if (outbound.leg !== "ida" || usedTripIds.has(outbound.trip.id)) continue;

    let bestInbound: typeof outbound | null = null;
    let bestInboundMs = Number.POSITIVE_INFINITY;

    for (const inbound of oneWayTrips) {
      if (inbound.leg !== "vuelta" || usedTripIds.has(inbound.trip.id)) continue;
      if (inbound.trip.id === outbound.trip.id) continue;
      if (!isValidRoundTripPair(outbound.flight, inbound.flight, maxDays)) continue;

      const inboundMs = getFlightDepartureMs(inbound.flight);
      if (inboundMs < bestInboundMs) {
        bestInbound = inbound;
        bestInboundMs = inboundMs;
      }
    }

    if (bestInbound) {
      usedTripIds.add(outbound.trip.id);
      usedTripIds.add(bestInbound.trip.id);
      pairs.push({ idaTrip: outbound.trip, vueltaTrip: bestInbound.trip });
    }
  }

  return pairs;
};

const shouldCorrectLikelyNextYearFlight = (
  flight: Flight | null | undefined,
  referenceDate: Date | null
): boolean => {
  const flightDate = safeDate(flight?.departureDateTime ?? null);
  if (!flightDate || !referenceDate) return false;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const flightYear = flightDate.getFullYear();
  const flightMonth = flightDate.getMonth();

  if (flightYear !== refYear + 1) return false;
  if (refMonth === 11 && flightMonth <= 1) return false;

  return flightMonth < refMonth;
};

const shiftFlightYear = (flight: Flight, yearDelta: number): Flight => {
  const shiftIso = (value?: string | null): string | null => {
    const date = safeDate(value ?? null);
    if (!date) return value ?? null;
    date.setFullYear(date.getFullYear() + yearDelta);
    return date.toISOString();
  };

  return {
    ...flight,
    departureDateTime: shiftIso(flight.departureDateTime),
    arrivalDateTime: shiftIso(flight.arrivalDateTime),
  };
};

const getLikelyYearCorrection = (
  trip: Trip
): { departureFlight: Flight | null; returnFlight: Flight | null; purchaseDate?: string } | null => {
  const referenceDate =
    safeDate(trip.createdAt || null) ||
    safeDate(trip.purchaseDate || null);

  if (!referenceDate || referenceDate.getFullYear() >= 2027) return null;

  let changed = false;
  const departureFlight =
    trip.departureFlight && shouldCorrectLikelyNextYearFlight(trip.departureFlight, referenceDate)
      ? ((changed = true), shiftFlightYear(trip.departureFlight, -1))
      : trip.departureFlight;
  const returnFlight =
    trip.returnFlight && shouldCorrectLikelyNextYearFlight(trip.returnFlight, referenceDate)
      ? ((changed = true), shiftFlightYear(trip.returnFlight, -1))
      : trip.returnFlight;

  if (!changed) return null;

  const correctedFirstFlight = departureFlight || returnFlight;
  const purchaseDate =
    trip.purchaseDate && safeDate(trip.purchaseDate)?.getFullYear() === 2027 && correctedFirstFlight?.departureDateTime
      ? correctedFirstFlight.departureDateTime
      : trip.purchaseDate;

  return { departureFlight, returnFlight, purchaseDate };
};

const getDuplicateOneWayTripIds = (sourceTrips: Trip[]): string[] => {
  const seen = new Map<string, Trip>();
  const duplicateIds: string[] = [];

  for (const trip of sourceTrips) {
    if (getInvalidRoundTripFlights(trip)) continue;

    const leg = getOneWayLeg(trip);
    if (!leg) continue;

    const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
    const flight = leg === "ida" ? idaFlight : vueltaFlight;
    if (!flight) continue;

    const key = [
      normalizeFlightNumber(flight.flightNumber),
      normalizeFlightDateTime(flight.departureDateTime),
      normalizeFlightIdentityField(flight.departureAirportCode),
      normalizeFlightIdentityField(flight.arrivalAirportCode),
    ].join("|");

    if (key.includes("||") || key.startsWith("|")) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, trip);
      continue;
    }

    const existingCreatedAt = safeDate(existing.createdAt || null)?.getTime() ?? 0;
    const tripCreatedAt = safeDate(trip.createdAt || null)?.getTime() ?? 0;
    const deleteTrip = tripCreatedAt >= existingCreatedAt ? trip : existing;
    const keepTrip = deleteTrip.id === trip.id ? existing : trip;

    duplicateIds.push(deleteTrip.id);
    seen.set(key, keepTrip);
  }

  return Array.from(new Set(duplicateIds));
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
  const [gmailImportState, setGmailImportState] = useState<{
    loading: boolean;
    message: string | null;
    error: string | null;
  }>({
    loading: false,
    message: null,
    error: null,
  });

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
  const sanitizingTripIdsRef = useRef<Set<string>>(new Set());
  const reconcilingPairKeysRef = useRef<Set<string>>(new Set());
  const correctingYearTripIdsRef = useRef<Set<string>>(new Set());
  const deletingDuplicateTripIdsRef = useRef<Set<string>>(new Set());

  /* -------------------- config: ventana temporal auto-agrupado -------------------- */
  // Ajustable: si querés más estricto, bajalo (ej 7-10 días). Si querés más flexible, subilo (ej 30-45).
  const AUTO_GROUP_WINDOW_DAYS = DEFAULT_MAX_ROUND_TRIP_DAYS;

  const getGmailImportSettingsRef = () => {
    if (!user || !db) return null;
    return doc(db, "users", user.uid, "settings", "gmailImport");
  };

  const getGmailReadonlyAccessToken = async (): Promise<string> => {
    if (!auth) throw new Error("Firebase Auth no esta inicializado.");

    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    provider.setCustomParameters({ prompt: "consent" });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    console.log("GoogleAuthProvider scopes configurados", [
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
    console.log("credential", credential);
    console.log("accessToken", accessToken);

    if (!accessToken) {
      throw new Error("No se pudo obtener permiso de lectura de Gmail.");
    }

    return accessToken;
  };

  const logGrantedScopes = async (accessToken: string) => {
    try {
      const tokenInfoUrl = `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(
        accessToken
      )}`;
      const res = await fetch(tokenInfoUrl);
      const payload = await res.json().catch(() => null);
      console.log("grantedScopes", {
        status: res.status,
        payload,
        scope: payload?.scope,
      });
    } catch (error) {
      console.log("grantedScopes", { error });
    }
  };

  const splitInvalidPersistedTrip = async (
    trip: Trip,
    idaFlight: Flight,
    vueltaFlight: Flight
  ) => {
    if (!user || !db || sanitizingTripIdsRef.current.has(trip.id)) return;

    sanitizingTripIdsRef.current.add(trip.id);

    try {
      console.warn("Corrigiendo grupo persistido invalido en Firestore", {
        tripId: trip.id,
        ida: idaFlight.departureDateTime,
        vuelta: vueltaFlight.departureDateTime,
      });

      await updateDoc(doc(db, "users", user.uid, "trips", trip.id), {
        departureFlight: idaFlight,
        returnFlight: null,
      });

      const vueltaDoc = await addDoc(collection(db, "users", user.uid, "trips"), {
        departureFlight: null,
        returnFlight: vueltaFlight,
        purchaseDate: trip.purchaseDate || idaFlight.departureDateTime || new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      await moveBoardingPass(user.uid, trip.id, vueltaDoc.id, "vuelta");
    } catch (error) {
      console.error("No se pudo corregir el grupo persistido invalido:", error);
    } finally {
      sanitizingTripIdsRef.current.delete(trip.id);
    }
  };

  const correctLikelyFutureYearTrip = async (
    trip: Trip,
    correction: { departureFlight: Flight | null; returnFlight: Flight | null; purchaseDate?: string }
  ) => {
    if (!user || !db || correctingYearTripIdsRef.current.has(trip.id)) return;

    correctingYearTripIdsRef.current.add(trip.id);

    try {
      console.warn("Corrigiendo año probablemente mal inferido en Firestore", {
        tripId: trip.id,
        departure: correction.departureFlight?.departureDateTime,
        return: correction.returnFlight?.departureDateTime,
      });

      await updateDoc(doc(db, "users", user.uid, "trips", trip.id), {
        departureFlight: correction.departureFlight,
        returnFlight: correction.returnFlight,
        purchaseDate: correction.purchaseDate || trip.purchaseDate || null,
      });
    } catch (error) {
      console.error("No se pudo corregir el año del vuelo persistido:", error);
    } finally {
      correctingYearTripIdsRef.current.delete(trip.id);
    }
  };

  const deleteDuplicatePersistedTrip = async (tripId: string) => {
    if (!user || !db || deletingDuplicateTripIdsRef.current.has(tripId)) return;

    deletingDuplicateTripIdsRef.current.add(tripId);

    try {
      console.warn("Eliminando tramo duplicado persistido", { tripId });
      await deleteDoc(doc(db, "users", user.uid, "trips", tripId));
      await deleteBoardingPassesForTrip(user.uid, tripId);
    } catch (error) {
      console.error("No se pudo eliminar el tramo duplicado:", error);
    } finally {
      deletingDuplicateTripIdsRef.current.delete(tripId);
    }
  };

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

        const yearCorrections = list
          .map((trip) => ({ trip, correction: getLikelyYearCorrection(trip) }))
          .filter(
            (entry): entry is {
              trip: Trip;
              correction: { departureFlight: Flight | null; returnFlight: Flight | null; purchaseDate?: string };
            } => !!entry.correction
          );

        if (yearCorrections.length > 0) {
          for (const { trip, correction } of yearCorrections) {
            void correctLikelyFutureYearTrip(trip, correction);
          }
          return;
        }

        const duplicateTripIds = getDuplicateOneWayTripIds(list).filter(
          (tripId) => !deletingDuplicateTripIdsRef.current.has(tripId)
        );

        if (duplicateTripIds.length > 0) {
          for (const tripId of duplicateTripIds) {
            void deleteDuplicatePersistedTrip(tripId);
          }
          return;
        }

        const invalidTrips = list
          .map((trip) => ({ trip, invalid: getInvalidRoundTripFlights(trip) }))
          .filter(
            (entry): entry is {
              trip: Trip;
              invalid: { idaFlight: Flight; vueltaFlight: Flight };
            } => !!entry.invalid
          );

        if (invalidTrips.length > 0) {
          for (const { trip, invalid } of invalidTrips) {
            void splitInvalidPersistedTrip(
              trip,
              invalid.idaFlight,
              invalid.vueltaFlight
            );
          }
          return;
        }

        for (const { idaTrip, vueltaTrip } of findPersistedOneWayPairs(list)) {
          const pairKey = [idaTrip.id, vueltaTrip.id].sort().join("|");
          if (reconcilingPairKeysRef.current.has(pairKey)) continue;

          reconcilingPairKeysRef.current.add(pairKey);
          void reconcilePersistedOneWayPair(idaTrip, vueltaTrip, pairKey);
        }
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
    if (!isValidRoundTripPair(idaFlight, vueltaFlight, AUTO_GROUP_WINDOW_DAYS)) {
      console.warn("Agrupamiento rechazado: vuelta anterior, ruta invalida o fuera de ventana.", {
        ida: idaFlight.departureDateTime,
        vuelta: vueltaFlight.departureDateTime,
      });
      window.alert("No se puede agrupar: la vuelta debe ser posterior a la ida y estar dentro de 15 dias.");
      return;
    }

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
    const removeLeg = remove.id === source.id ? sLeg : tLeg;

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
      await moveBoardingPass(user.uid, remove.id, keep.id, removeLeg);
      await deleteDoc(doc(db, "users", user.uid, "trips", remove.id));
      await deleteBoardingPassesForTrip(user.uid, remove.id);
    }
  };

  const reconcilePersistedOneWayPair = async (
    idaTrip: Trip,
    vueltaTrip: Trip,
    pairKey: string
  ) => {
    try {
      console.info("Reagrupando tramos persistidos validos", {
        idaTripId: idaTrip.id,
        vueltaTripId: vueltaTrip.id,
        ida: normalizeTripFlights(idaTrip).idaFlight?.departureDateTime,
        vuelta: normalizeTripFlights(vueltaTrip).vueltaFlight?.departureDateTime,
      });

      await mergeTwoTrips(idaTrip, vueltaTrip);
    } catch (error) {
      console.error("No se pudo reagrupar tramos persistidos validos:", error);
    } finally {
      reconcilingPairKeysRef.current.delete(pairKey);
    }
  };

  const updateDuplicateFlightFinancialData = async (candidate: Flight) => {
    if (!user || !db) return false;

    for (const trip of trips) {
      const entries: Array<{
        field: "departureFlight" | "returnFlight";
        existing: Flight | null;
      }> = [
        { field: "departureFlight", existing: trip.departureFlight },
        { field: "returnFlight", existing: trip.returnFlight },
      ];

      for (const entry of entries) {
        if (!entry.existing || !flightMatchesIdentity(candidate, entry.existing)) continue;

        const mergedFlight = mergeFlightFinancialData(entry.existing, candidate);
        const changed =
          mergedFlight.cost !== entry.existing.cost ||
          mergedFlight.paymentMethod !== entry.existing.paymentMethod ||
          mergedFlight.paymentSource !== entry.existing.paymentSource;

        if (!changed) return false;

        console.info("Actualizando datos financieros de vuelo duplicado", {
          tripId: trip.id,
          field: entry.field,
          flightNumber: candidate.flightNumber,
          detectedPaymentRaw: candidate.paymentMethod,
          normalizedPaymentMethod: normalizePaymentMethod(candidate.paymentMethod),
          detectedAmount: candidate.cost,
          source: candidate.source || "email/body",
        });

        await updateDoc(doc(db, "users", user.uid, "trips", trip.id), {
          [entry.field]: mergedFlight,
        });
        return true;
      }
    }

    return false;
  };

  const onUpdateTripPayment = async (
    trip: Trip,
    leg: "ida" | "vuelta",
    paymentMethod: string
  ) => {
    if (!user || !db) return;

    const { idaFlight, vueltaFlight } = normalizeTripFlights(trip);
    const flight = leg === "ida" ? idaFlight : vueltaFlight;
    if (!flight) return;

    const field =
      trip.departureFlight === flight
        ? "departureFlight"
        : trip.returnFlight === flight
        ? "returnFlight"
        : null;

    if (!field) {
      console.warn("No se pudo resolver el campo del tramo para editar pago", {
        tripId: trip.id,
        leg,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const normalizedPayment = normalizePaymentMethod(paymentMethod).label;
    const updatedFlight: Flight = {
      ...flight,
      paymentMethod: normalizedPayment,
      paymentSource: "manual",
      paymentUpdatedAt: nowIso,
    };

    await updateDoc(doc(db, "users", user.uid, "trips", trip.id), {
      [field]: updatedFlight,
      updatedAt: nowIso,
    });
  };

  /**
   * Agregar viaje:
   * - Primero intentamos auto-merge SOLO en el momento de alta.
   * - Si no hay match, guardamos el doc nuevo normalmente.
   */
  const onAddTrip = async (tripData: Omit<Trip, "id" | "createdAt">) => {
    if (!user || !db) return;

    const nowIso = new Date().toISOString();
    const normalizedTripData = normalizeTripPayment(tripData);

    // Evitar doble ejecución accidental (doble click, etc.)
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const duplicateDeparture =
        !!normalizedTripData.departureFlight &&
        flightAlreadyExists(normalizedTripData.departureFlight, trips);
      const duplicateReturn =
        !!normalizedTripData.returnFlight &&
        flightAlreadyExists(normalizedTripData.returnFlight, trips);

      if (duplicateDeparture && normalizedTripData.departureFlight) {
        await updateDuplicateFlightFinancialData(normalizedTripData.departureFlight);
      }
      if (duplicateReturn && normalizedTripData.returnFlight) {
        await updateDuplicateFlightFinancialData(normalizedTripData.returnFlight);
      }

      const tripToSave: Omit<Trip, "id" | "createdAt"> = {
        ...normalizedTripData,
        departureFlight: duplicateDeparture ? null : normalizedTripData.departureFlight ?? null,
        returnFlight: duplicateReturn ? null : normalizedTripData.returnFlight ?? null,
      };

      if (!tripToSave.departureFlight && !tripToSave.returnFlight) {
        window.alert("Este viaje ya existe en Vueluc. No se guardó un duplicado.");
        return;
      }

      if (duplicateDeparture || duplicateReturn) {
        window.alert(
          "Uno de los tramos ya existía en Vueluc. Se guardará solamente el tramo faltante."
        );
      }

      const draftFake: Trip = {
        id: "__draft__",
        createdAt: nowIso,
        purchaseDate: tripToSave.purchaseDate || nowIso,
        departureFlight: tripToSave.departureFlight ?? null,
        returnFlight: tripToSave.returnFlight ?? null,
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

          const idaCandidate = legA === "ida" ? fA : fB;
          const vueltaCandidate = legA === "vuelta" ? fA : fB;

          if (!isValidRoundTripPair(idaCandidate, vueltaCandidate, AUTO_GROUP_WINDOW_DAYS)) {
            continue;
          }

          const d = getRoundTripGapDays(idaCandidate, vueltaCandidate);
          if (d != null && (!bestMatch || d < bestMatch.score)) {
            bestMatch = { trip: existing, score: d };
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
        ...tripToSave,
        createdAt: nowIso,
        purchaseDate: tripToSave.purchaseDate || nowIso,
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

  const handleGmailImport = async () => {
    if (!user || !db) return;

    const settingsRef = getGmailImportSettingsRef();
    if (!settingsRef) return;

    setGmailImportState({
      loading: true,
      message: "Buscando correos...",
      error: null,
    });

    try {
      const accessToken = await getGmailReadonlyAccessToken();
      await logGrantedScopes(accessToken);

      let settings: GmailImportSettings = {};
      try {
        const settingsSnap = await getDoc(settingsRef);
        settings = (settingsSnap.exists()
          ? settingsSnap.data()
          : {}) as GmailImportSettings;
        console.log("gmailImportSettings", {
          source: "firestore",
          exists: settingsSnap.exists(),
          processedCount: settings.processedMessageIds?.length || 0,
        });
      } catch (error) {
        console.log("gmailImportSettingsError", error);
        console.log("gmailError", {
          stage: "firestore-settings-read",
          error,
        });
      }

      const result = await importTripsFromGmail(accessToken, settings);

      for (const trip of result.trips) {
        await onAddTrip(trip);
      }

      const message =
        result.trips.length > 0
          ? `${result.trips.length} vuelos importados`
          : "Sin vuelos nuevos";

      try {
        await setDoc(
          settingsRef,
          {
            lastScanAt: new Date().toISOString(),
            processedMessageIds: result.processedMessageIds,
            lastResult: message,
            lastError: null,
          },
          { merge: true }
        );
      } catch (error) {
        console.log("gmailImportSettingsError", error);
        console.log("gmailError", {
          stage: "firestore-settings-write",
          error,
        });
      }

      setGmailImportState({
        loading: false,
        message,
        error: null,
      });
    } catch (error: any) {
      const rawMessage = error?.message || "No se pudo importar desde Gmail.";
      const message = rawMessage.includes("Missing or insufficient permissions")
        ? `Permisos insuficientes: ${rawMessage}. Revisar consola para confirmar si viene de Gmail API o Firestore.`
        : rawMessage;
      console.log("gmailError", {
        stage: "gmail-import",
        error,
        message,
      });

      await setDoc(
        settingsRef,
        {
          lastScanAt: new Date().toISOString(),
          lastError: message,
        },
        { merge: true }
      ).catch(() => {});

      setGmailImportState({
        loading: false,
        message: null,
        error: message,
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* IMPORTANT: useMemo SIEMPRE ANTES de cualquier return condicional     */
  /* ------------------------------------------------------------------ */

  const displayTrips = useMemo(
    () => splitInvalidRoundTripsForDisplay(trips),
    [trips]
  );

  const futureTrips = useMemo(() => {
    if (!displayTrips?.length) return [];
    const now = new Date();

    return [...displayTrips]
      .filter((t) => {
        const end = getTripEndDate(t);
        return !!end && end > now;
      })
      .sort((a, b) => {
        const sa = getTripStartDate(a)?.getTime() || 0;
        const sb = getTripStartDate(b)?.getTime() || 0;
        return sa - sb;
      });
  }, [displayTrips]);

  const nextTrip = futureTrips[0] ?? null;

  const nextTripFlight = useMemo(() => {
    if (!nextTrip) return null;
    const { idaFlight, vueltaFlight } = normalizeTripFlights(nextTrip);
    return idaFlight || vueltaFlight || null;
  }, [nextTrip]);

  const nextTripFlightType = useMemo<"ida" | "vuelta">(() => {
    if (!nextTrip) return "ida";
    const { idaFlight } = normalizeTripFlights(nextTrip);
    return idaFlight ? "ida" : "vuelta";
  }, [nextTrip]);

  const filteredTrips = useMemo(() => {
  if (!displayTrips?.length) return [];
  const now = new Date();

  const filtered = [...displayTrips].filter((t) => {
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

  // 🔑 ORDEN CRONOLÓGICO REAL (por fecha del viaje, no createdAt)
  filtered.sort((a, b) => {
    const sa = getTripStartDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const sb = getTripStartDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    return sa - sb;
  });

  // Opcional: completados del más reciente al más antiguo
  if (listFilter === "completed") filtered.reverse();

  return filtered;
}, [displayTrips, listFilter]);

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

            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <button
                type="button"
                onClick={handleGmailImport}
                disabled={gmailImportState.loading}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <MailIcon className="w-5 h-5 mr-2" />
                {gmailImportState.loading ? "Buscando correos..." : "Importar desde Gmail"}
              </button>

              {(gmailImportState.message || gmailImportState.error) && (
                <p
                  className={`text-sm ${
                    gmailImportState.error
                      ? "text-red-600 dark:text-red-300"
                      : "text-green-700 dark:text-green-300"
                  }`}
                >
                  {gmailImportState.error || gmailImportState.message}
                </p>
              )}
            </div>

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
              onUpdatePayment={onUpdateTripPayment}
            />
          </>
        )}

        {view === "calendar" && <CalendarView trips={displayTrips} />}
        {view === "costs" && <CostSummary trips={displayTrips} />}

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
