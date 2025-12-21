import React, { useMemo, useState } from "react";
import type { Trip, Flight } from "../types";
import { BriefcaseIcon } from "./icons/BriefcaseIcon";
import { CalculatorIcon } from "./icons/CalculatorIcon";
import { CurrencyIcon } from "./icons/CurrencyIcon";
import { ChevronDownIcon } from "./icons/ChevronDownIcon";
import { AirlineLogo } from "./AirlineLogo";

interface CostSummaryProps {
  trips: Trip[];
}

// Optimized StatCard for mobile:
// - Uses flex-col on small screens to stack Icon + Label + Value vertically, ensuring value has full width.
// - Uses flex-row on larger screens (sm) for the classic side-by-side look.
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  gradient: string;
}> = ({ icon, label, value, gradient }) => (
  <div className="p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 min-w-0">
    <div
      className={`p-2 rounded-full ${gradient} text-white shadow-md flex-shrink-0 self-start sm:self-center`}
    >
      {icon}
    </div>
    <div className="min-w-0 flex-1 w-full">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p
        className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white truncate tracking-tight w-full"
        title={value}
      >
        {value}
      </p>
    </div>
  </div>
);

// ---------- Helpers ----------
const safeDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
};

// Año del vuelo: preferimos arrivalDateTime; fallback departureDateTime
const getFlightYear = (flight: Flight | null): number | null => {
  if (!flight) return null;
  const d = safeDate(flight.arrivalDateTime) || safeDate(flight.departureDateTime);
  return d ? d.getFullYear() : null;
};

// Marca completado por fecha fin: preferimos arrivalDateTime; fallback departureDateTime
const isFlightCompleted = (flight: Flight | null, now: Date): boolean => {
  if (!flight) return false;
  const end = safeDate(flight.arrivalDateTime) || safeDate(flight.departureDateTime);
  return !!end && end < now;
};

// Compra (estricto): SOLO purchaseDate (no createdAt)
const getPurchaseYearStrict = (trip: Trip): number | null => {
  const d = safeDate(trip.purchaseDate || null);
  return d ? d.getFullYear() : null;
};

// ---------- Payment methods (ONLY 6, fixed order) ----------
const PAYMENT_ORDER = [
  "Débito Macro",
  "Débito Ciudad",
  "Débito Nación",
  "Crédito Macro",
  "Crédito Ciudad",
  "Crédito Yoy",
] as const;

type PaymentLabel = (typeof PAYMENT_ORDER)[number];

/**
 * Devuelve SOLO uno de los 6 métodos permitidos.
 * Todo lo demás se ignora (null) para evitar "Debito", "Tarjeta de crédito", etc.
 */
const formatPaymentMethod = (paymentMethod: string | null): PaymentLabel | null => {
  if (!paymentMethod) return null;

  const pm = String(paymentMethod);

  // Detecta por últimos 4 / máscara típica
  if (pm.includes("6007")) return "Débito Macro";
  if (pm.includes("9417")) return "Débito Ciudad";
  if (pm.includes("7005")) return "Débito Nación";
  if (pm.includes("5603")) return "Crédito Macro";
  if (pm.includes("8769")) return "Crédito Ciudad";
  if (pm.includes("8059")) return "Crédito Yoy";

  // Si ya vino normalizado exactamente como uno de los 6
  if ((PAYMENT_ORDER as readonly string[]).includes(pm)) return pm as PaymentLabel;

  return null;
};

const CostSummary: React.FC<CostSummaryProps> = ({ trips }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  // Años disponibles (GASTOS): por purchaseDate (estricto)
  const availableYears = useMemo(() => {
    const years = new Set<number>();

    for (const trip of trips) {
      const y = getPurchaseYearStrict(trip);
      if (y != null) years.add(y);
    }

    const uniqueYears = Array.from(years).sort((a, b) => b - a);

    // fallback: si no hay nada, mostrar año actual
    const currentYear = new Date().getFullYear();
    if (uniqueYears.length === 0 || !uniqueYears.includes(currentYear)) {
      uniqueYears.unshift(currentYear);
    }

    return uniqueYears;
  }, [trips]);

  // Trips para GASTOS del año seleccionado: purchaseDate (estricto)
  const tripsForPurchaseYear = useMemo(() => {
    return trips.filter((trip) => getPurchaseYearStrict(trip) === selectedYear);
  }, [trips, selectedYear]);

  // Tramos completados por AÑO DE VUELO (independiente de gastos)
  const completedLegsForYear = useMemo(() => {
    const now = new Date();
    let count = 0;

    for (const trip of trips) {
      // ida
      if (getFlightYear(trip.departureFlight) === selectedYear) {
        if (isFlightCompleted(trip.departureFlight, now)) count += 1;
      }
      // vuelta
      if (getFlightYear(trip.returnFlight) === selectedYear) {
        if (isFlightCompleted(trip.returnFlight, now)) count += 1;
      }
    }

    return count;
  }, [trips, selectedYear]);

  // Gasto total del año (estricto por purchaseDate)
  const totalCostForYear = useMemo(() => {
    return tripsForPurchaseYear.reduce((sum, trip) => {
      const idaCost = trip.departureFlight?.cost || 0;
      const vueltaCost = trip.returnFlight?.cost || 0;
      return sum + idaCost + vueltaCost;
    }, 0);
  }, [tripsForPurchaseYear]);

  // Métodos de pago (estricto por purchaseDate)
  const paymentMethodSummary = useMemo(() => {
    const costsByMethod: Record<PaymentLabel, number> = {
      "Débito Macro": 0,
      "Débito Ciudad": 0,
      "Débito Nación": 0,
      "Crédito Macro": 0,
      "Crédito Ciudad": 0,
      "Crédito Yoy": 0,
    };

    for (const trip of tripsForPurchaseYear) {
      for (const flight of [trip.departureFlight, trip.returnFlight]) {
        if (!flight) continue;
        if (!flight.cost || flight.cost <= 0) continue;

        const label = formatPaymentMethod(flight.paymentMethod || null);
        if (!label) continue;

        costsByMethod[label] += flight.cost;
      }
    }

    return PAYMENT_ORDER
      .map((method) => ({ method, total: costsByMethod[method] }))
      .filter((x) => x.total > 0);
  }, [tripsForPurchaseYear]);

  // Desglose mensual (estricto por purchaseDate)
  const monthlyBreakdown = useMemo(() => {
    type MonthlyItem = {
      flight: Flight;
      type: "ida" | "vuelta";
      purchaseDate: string; // SIEMPRE purchaseDate real
    };

    const dataByMonth: {
      [monthIndex: number]: { cost: number; items: MonthlyItem[] };
    } = {};

    for (const trip of tripsForPurchaseYear) {
      // Estricto: si no hay purchaseDate, no se contabiliza (evita mostrar fecha falsa)
      const costDateStr = trip.purchaseDate;
      if (!costDateStr) continue;

      const purchaseDate = new Date(costDateStr);
      const monthIndex = purchaseDate.getMonth();
      if (isNaN(monthIndex)) continue;

      if (!dataByMonth[monthIndex]) {
        dataByMonth[monthIndex] = { cost: 0, items: [] };
      }

      if (trip.departureFlight && (trip.departureFlight.cost || 0) > 0) {
        dataByMonth[monthIndex].cost += trip.departureFlight.cost || 0;
        dataByMonth[monthIndex].items.push({
          flight: trip.departureFlight,
          type: "ida",
          purchaseDate: costDateStr,
        });
      }

      if (trip.returnFlight && (trip.returnFlight.cost || 0) > 0) {
        dataByMonth[monthIndex].cost += trip.returnFlight.cost || 0;
        dataByMonth[monthIndex].items.push({
          flight: trip.returnFlight,
          type: "vuelta",
          purchaseDate: costDateStr,
        });
      }
    }

    const allMonths = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];

    return allMonths.map((name, index) => ({
      name,
      index,
      cost: dataByMonth[index]?.cost || 0,
      items:
        dataByMonth[index]?.items.sort(
          (a, b) =>
            new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
        ) || [],
    }));
  }, [tripsForPurchaseYear]);

  const maxMonthlyCost = Math.max(...monthlyBreakdown.map((m) => m.cost), 1);

  const handleToggleMonth = (index: number) => {
    setExpandedMonth((prev) => (prev === index ? null : index));
  };

  if (trips.length === 0) {
    return (
      <div className="text-center py-20 px-6 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
        <CalculatorIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
        <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">
          Sin Datos de Costos
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Agrega viajes para comenzar a analizar tus gastos.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out p-3 sm:p-6 space-y-6 sm:space-y-8">
      <div>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
            Resumen Anual
          </h3>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-white dark:bg-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm appearance-none text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <StatCard
            icon={<BriefcaseIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Tramos completados"
            value={completedLegsForYear.toString()}
            gradient="bg-gradient-to-br from-indigo-500 to-purple-600"
          />
          <StatCard
            icon={<CurrencyIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Gasto Total"
            value={`$${totalCostForYear.toLocaleString("es-AR", {
              maximumFractionDigits: 0,
            })}`}
            gradient="bg-gradient-to-br from-teal-500 to-cyan-600"
          />
        </div>
      </div>

      {paymentMethodSummary.length > 0 && (
        <div className="px-1">
          <h3 className="text-lg sm:text-xl font-bold mb-3 text-slate-800 dark:text-white">
            Métodos de Pago
          </h3>
          <div className="space-y-3">
            {paymentMethodSummary.map(({ method, total }) => {
              const widthPercentage =
                totalCostForYear > 0 ? (total / totalCostForYear) * 100 : 0;
              return (
                <div key={method}>
                  <div className="flex justify-between items-center mb-1 text-xs sm:text-sm">
                    <span className="font-semibold text-slate-600 dark:text-slate-300 truncate pr-2">
                      {method}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      $
                      {total.toLocaleString("es-AR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 sm:h-2 shadow-inner">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-600 h-1.5 sm:h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${widthPercentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-1">
        <h3 className="text-lg sm:text-xl font-bold mb-4 text-slate-800 dark:text-white">
          Desglose Mensual
        </h3>
        <div className="space-y-2 sm:space-y-3">
          {monthlyBreakdown.map(({ name, cost, index, items }) => {
            const widthPercentage =
              maxMonthlyCost > 0 ? (cost / maxMonthlyCost) * 100 : 0;
            const isExpanded = expandedMonth === index;
            const hasData = cost > 0;

            return (
              <div key={name} className="flex flex-col">
                <div
                  className={`flex items-center gap-2 py-2 rounded-lg transition-colors select-none ${
                    hasData
                      ? "cursor-pointer active:bg-slate-200 dark:active:bg-slate-700/80 sm:hover:bg-slate-200 sm:dark:hover:bg-slate-700/50"
                      : "opacity-40"
                  }`}
                  onClick={() => hasData && handleToggleMonth(index)}
                >
                  <span className="font-semibold text-sm text-slate-600 dark:text-slate-400 w-8 text-right flex-shrink-0">
                    {name}
                  </span>

                  <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-2.5 sm:h-3 shadow-inner relative overflow-hidden mx-1">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-teal-500 h-2.5 sm:h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${widthPercentage}%` }}
                    />
                  </div>

                  <div className="min-w-[85px] sm:w-28 text-right flex-shrink-0">
                    <span className="font-bold text-sm sm:text-base text-slate-700 dark:text-slate-200 block truncate">
                      $
                      {cost.toLocaleString("es-AR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  {hasData ? (
                    <ChevronDownIcon
                      className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-300 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  ) : (
                    <div className="w-4 h-4 flex-shrink-0" />
                  )}
                </div>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isExpanded ? "max-h-[2000px] opacity-100 mt-1" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="space-y-2 pl-2 sm:pl-10">
                    {items.map((item, i) => (
                      <div
                        key={i}
                        className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm relative overflow-hidden"
                      >
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-1 ${
                            item.type === "ida" ? "bg-blue-500" : "bg-green-500"
                          }`}
                        ></div>

                        <div className="flex items-start justify-between w-full pl-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <AirlineLogo airline={item.flight.airline} size="xs" type="isotipo" />
                              <span className="font-bold dark:text-white truncate">
                                {item.flight.flightNumber}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wide sm:hidden flex-shrink-0 ${
                                  item.type === "ida"
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                                    : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                                }`}
                              >
                                {item.type}
                              </span>
                            </div>

                            {/* ESTRICTO: fecha de compra (purchaseDate) */}
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span className="hidden sm:inline">• </span>
                              {formatDate(item.purchaseDate)}
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0 ml-2">
                            <span className="font-bold text-slate-700 dark:text-slate-200 block">
                              $
                              {(item.flight.cost || 0).toLocaleString("es-AR", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CostSummary;
