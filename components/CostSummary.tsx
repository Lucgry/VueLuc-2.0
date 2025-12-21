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

const getTripEndDate = (trip: Trip): Date | null => {
  const dateStr =
    trip.returnFlight?.arrivalDateTime || trip.departureFlight?.arrivalDateTime;
  return dateStr ? new Date(dateStr) : null;
};

const formatPaymentMethod = (paymentMethod: string | null): string => {
  if (!paymentMethod) return "N/A";

  const pm = String(paymentMethod);

  // Detect from masked card numbers / last-4 patterns found in emails
  if (pm.includes("6007")) return "Débito Macro";
  if (pm.includes("9417")) return "Débito Ciudad";
  if (pm.includes("5603")) return "Crédito Macro";
  if (pm.includes("8769")) return "Crédito Ciudad";
  if (pm.includes("8059")) return "Crédito Yoy";
  if (pm.includes("7005")) return "Débito Nación";

  // If already normalized
  const standards = [
    "Débito Macro",
    "Débito Ciudad",
    "Crédito Macro",
    "Crédito Ciudad",
    "Crédito Yoy",
    "Débito Nación",
  ];
  if (standards.includes(pm)) return pm;

  // Fallback: keep original (but avoid super generic labels if you prefer)
  return pm;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
};

// --- Helpers: year-by-flight-date + completed-by-leg ---
const getFlightDateForYear = (f: Flight): Date | null => {
  // For "year": use departure; if missing, use arrival.
  const d = f.departureDateTime || f.arrivalDateTime;
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

const isFlightCompleted = (f: Flight, now: Date): boolean => {
  // "completed" per leg = arrived before now
  if (!f.arrivalDateTime) return false;
  const a = new Date(f.arrivalDateTime);
  return !isNaN(a.getTime()) && a < now;
};

const CostSummary: React.FC<CostSummaryProps> = ({ trips }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  // Available years based on flight dates (departure/arrival), not purchaseDate
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();

    for (const trip of trips) {
      const flights = [trip.departureFlight, trip.returnFlight].filter(
        Boolean
      ) as Flight[];
      for (const f of flights) {
        const dt = getFlightDateForYear(f);
        if (dt) yearsSet.add(dt.getFullYear());
      }
    }

    const uniqueYears = Array.from(yearsSet).sort(
      (a: number, b: number) => b - a
    );

    const currentYear = new Date().getFullYear();
    if (uniqueYears.length === 0 || !uniqueYears.includes(currentYear)) {
      uniqueYears.unshift(currentYear);
    }
    return uniqueYears;
  }, [trips]);

  // Legs (flights) for selected year (based on flight date)
  const legsForSelectedYear = useMemo(() => {
    const legs: Flight[] = [];
    for (const trip of trips) {
      if (trip.departureFlight) legs.push(trip.departureFlight);
      if (trip.returnFlight) legs.push(trip.returnFlight);
    }

    return legs.filter((f) => {
      const dt = getFlightDateForYear(f);
      return !!dt && dt.getFullYear() === selectedYear;
    });
  }, [trips, selectedYear]);

  // Completed legs for selected year
  const completedLegsForYear = useMemo(() => {
    const now = new Date();
    return legsForSelectedYear.filter((f) => isFlightCompleted(f, now));
  }, [legsForSelectedYear]);

  const totalCompletedLegsForYear = completedLegsForYear.length;

  // Total cost for year: sum of legs that belong to that year (by flight date)
  const totalCostForYear = useMemo(() => {
    return legsForSelectedYear.reduce((sum, f) => sum + (f.cost || 0), 0);
  }, [legsForSelectedYear]);

  // Payment method summary for the year: sum of legs-in-year by payment method
  const paymentMethodSummary = useMemo(() => {
    const costsByMethod: { [key: string]: number } = {};

    for (const f of legsForSelectedYear) {
      const cost = f.cost || 0;
      if (cost <= 0) continue;

      const formattedMethod = formatPaymentMethod(f.paymentMethod ?? null);
      if (!formattedMethod || formattedMethod === "N/A") continue;

      costsByMethod[formattedMethod] = (costsByMethod[formattedMethod] || 0) + cost;
    }

    return Object.entries(costsByMethod)
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
  }, [legsForSelectedYear]);

  // Monthly breakdown for the year: group by flight departure date month (fallback arrival)
  const monthlyBreakdown = useMemo(() => {
    type MonthlyItem = {
      flight: Flight;
      type: "ida" | "vuelta";
      dateKey: string; // used for sorting
    };

    const dataByMonth: {
      [monthIndex: number]: { cost: number; items: MonthlyItem[] };
    } = {};

    // We still need "ida/vuelta" badge: infer from flightNumber occurrence inside trips.
    // We do it by iterating trips and pushing legs that belong to selectedYear.
    for (const trip of trips) {
      const candidates: Array<{ f: Flight; type: "ida" | "vuelta" }> = [];
      if (trip.departureFlight) candidates.push({ f: trip.departureFlight, type: "ida" });
      if (trip.returnFlight) candidates.push({ f: trip.returnFlight, type: "vuelta" });

      for (const { f, type } of candidates) {
        const dt = getFlightDateForYear(f);
        if (!dt || dt.getFullYear() !== selectedYear) continue;

        const monthIndex = dt.getMonth();
        if (Number.isNaN(monthIndex)) continue;

        if (!dataByMonth[monthIndex]) dataByMonth[monthIndex] = { cost: 0, items: [] };

        const c = f.cost || 0;
        if (c > 0) {
          dataByMonth[monthIndex].cost += c;
        }

        dataByMonth[monthIndex].items.push({
          flight: f,
          type,
          dateKey: (f.departureDateTime || f.arrivalDateTime || "") as string,
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
        dataByMonth[index]?.items
          .slice()
          .sort(
            (a, b) =>
              new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime()
          ) || [],
    }));
  }, [trips, selectedYear]);

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

        {/* Grid layout with small gap to maximize horizontal space */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <StatCard
            icon={<BriefcaseIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Tramos completados"
            value={totalCompletedLegsForYear.toString()}
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
                  {/* Nombre del Mes */}
                  <span className="font-semibold text-sm text-slate-600 dark:text-slate-400 w-8 text-right flex-shrink-0">
                    {name}
                  </span>

                  {/* Barra de Progreso */}
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-2.5 sm:h-3 shadow-inner relative overflow-hidden mx-1">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-teal-500 h-2.5 sm:h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${widthPercentage}%` }}
                    />
                  </div>

                  {/* Monto */}
                  <div className="min-w-[85px] sm:w-28 text-right flex-shrink-0">
                    <span className="font-bold text-sm sm:text-base text-slate-700 dark:text-slate-200 block truncate">
                      $
                      {cost.toLocaleString("es-AR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  {/* Icono Expandir */}
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

                {/* Detalle Expandido - Optimizado para móvil */}
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
                        {/* Decoración lateral para indicar tipo */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-1 ${
                            item.type === "ida" ? "bg-blue-500" : "bg-green-500"
                          }`}
                        ></div>

                        <div className="flex items-start justify-between w-full pl-2">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <AirlineLogo
                                airline={item.flight.airline}
                                size="xs"
                                type="isotipo"
                              />
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
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span className="hidden sm:inline">• </span>
                              {formatDate(item.flight.departureDateTime)}
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
                    {items.length === 0 && (
                      <div className="text-xs opacity-70 pl-2 py-2">
                        Sin datos para este mes.
                      </div>
                    )}
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
