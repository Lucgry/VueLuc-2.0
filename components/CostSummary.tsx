import React, { useMemo, useState } from 'react';
import type { Trip } from '../types';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { CurrencyIcon } from './icons/CurrencyIcon';

interface CostSummaryProps {
  trips: Trip[];
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; gradient: string }> = ({ icon, label, value, gradient }) => (
    <div className="flex-1 p-4 rounded-lg flex items-center space-x-4 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
        <div className={`p-3 rounded-full ${gradient} text-white shadow-lg`}>
           {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
    </div>
);

const getTripEndDate = (trip: Trip): Date | null => {
    const dateStr = trip.returnFlight?.arrivalDateTime || trip.departureFlight?.arrivalDateTime;
    return dateStr ? new Date(dateStr) : null;
};

const formatPaymentMethod = (paymentMethod: string | null): string => {
  if (!paymentMethod) return 'N/A';

  if (paymentMethod.includes('6007')) return 'Débito Macro';
  if (paymentMethod.includes('9417')) return 'Débito Ciudad';
  if (paymentMethod.includes('5603')) return 'Crédito Macro';
  if (paymentMethod.includes('8769')) return 'Crédito Ciudad';
  if (paymentMethod.includes('8059')) return 'Crédito Yoy';
  
  return paymentMethod;
};

const CostSummary: React.FC<CostSummaryProps> = ({ trips }) => {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const availableYears = useMemo(() => {
        const yearsSet = trips.reduce((acc, trip) => {
            const dateStr = trip.departureFlight?.departureDateTime || trip.returnFlight?.departureDateTime;
            if (dateStr) {
                const year = new Date(dateStr).getFullYear();
                if (!Number.isNaN(year)) {
                    acc.add(year);
                }
            }
            return acc;
        }, new Set<number>());

        const uniqueYears = Array.from(yearsSet).sort((a: number, b: number) => b - a);

        if (uniqueYears.length === 0 || !uniqueYears.includes(new Date().getFullYear())) {
            uniqueYears.unshift(new Date().getFullYear());
        }
        return uniqueYears;
    }, [trips]);
    
    const tripsForSelectedYear = useMemo(() => {
        return trips.filter(trip => {
            const dateStr = trip.departureFlight?.departureDateTime || trip.returnFlight?.departureDateTime;
            return dateStr ? new Date(dateStr).getFullYear() === selectedYear : false;
        });
    }, [trips, selectedYear]);
    
    const completedTripsForYear = useMemo(() => {
        const now = new Date();
        return tripsForSelectedYear.filter(trip => {
            const endDate = getTripEndDate(trip);
            return endDate ? endDate < now : false;
        });
    }, [tripsForSelectedYear]);

    const totalCompletedTrips = completedTripsForYear.length;
    
    const totalCostForYear = useMemo(() => {
        return tripsForSelectedYear.reduce((sum, trip) => {
            const idaCost = trip.departureFlight?.cost || 0;
            const vueltaCost = trip.returnFlight?.cost || 0;
            return sum + idaCost + vueltaCost;
        }, 0);
    }, [tripsForSelectedYear]);

    const paymentMethodSummary = useMemo(() => {
        const costsByMethod: { [key: string]: number } = {};
        
        tripsForSelectedYear.forEach(trip => {
            [trip.departureFlight, trip.returnFlight].forEach(flight => {
                if (flight && flight.cost && flight.paymentMethod) {
                    const method = flight.paymentMethod;
                    costsByMethod[method] = (costsByMethod[method] || 0) + flight.cost;
                }
            });
        });

        return Object.entries(costsByMethod)
            .map(([method, total]) => ({ method, total }))
            .sort((a, b) => b.total - a.total);
    }, [tripsForSelectedYear]);
    
    const monthlyCosts = useMemo(() => {
        const costs = Array(12).fill(0);
        tripsForSelectedYear.forEach(trip => {
            if (trip.departureFlight?.departureDateTime && trip.departureFlight.cost) {
                const month = new Date(trip.departureFlight.departureDateTime).getMonth();
                costs[month] += trip.departureFlight.cost;
            }
            if (trip.returnFlight?.departureDateTime && trip.returnFlight.cost) {
                const month = new Date(trip.returnFlight.departureDateTime).getMonth();
                costs[month] += trip.returnFlight.cost;
            }
        });
        return costs;
    }, [tripsForSelectedYear]);


    const maxMonthlyCost = Math.max(...monthlyCosts, 1); // Avoid division by zero
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    if (trips.length === 0) {
        return (
            <div className="text-center py-20 px-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80">
                <CalculatorIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
                <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">Sin Datos de Costos</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">Agrega viajes para comenzar a analizar tus gastos.</p>
            </div>
        );
    }
  
    return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 md:p-6 space-y-8">
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Resumen Anual</h3>
                <select 
                    value={selectedYear} 
                    onChange={e => setSelectedYear(parseInt(e.target.value))}
                    className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                    {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>
            <div className="flex flex-col md:flex-row gap-4">
                <StatCard 
                    icon={<BriefcaseIcon className="h-6 w-6" />}
                    label="Viajes Realizados"
                    value={totalCompletedTrips.toString()}
                    gradient="bg-gradient-to-br from-indigo-500 to-purple-600"
                />
                 <StatCard 
                    icon={<CurrencyIcon className="h-6 w-6" />}
                    label="Gasto Total"
                    value={`$${totalCostForYear.toLocaleString('es-AR')}`}
                    gradient="bg-gradient-to-br from-teal-500 to-cyan-600"
                />
            </div>
        </div>

        {paymentMethodSummary.length > 0 && (
            <div>
                <h3 className="text-xl font-bold mb-4">Gastos por Método de Pago</h3>
                <div className="space-y-3">
                    {paymentMethodSummary.map(({ method, total }) => {
                        const widthPercentage = totalCostForYear > 0 ? (total / totalCostForYear) * 100 : 0;
                        return (
                            <div key={method}>
                                <div className="flex justify-between items-center mb-1 text-sm">
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPaymentMethod(method)}</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-100">${total.toLocaleString('es-AR')}</span>
                                </div>
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-2">
                                    <div
                                        className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                                        style={{ width: `${widthPercentage}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        <div>
            <h3 className="text-xl font-bold mb-4">Desglose Mensual</h3>
            <div className="space-y-3">
                {months.map((month, index) => {
                    const cost = monthlyCosts[index];
                    if (cost === 0 && tripsForSelectedYear.length > 0) return null;

                    const widthPercentage = maxMonthlyCost > 0 ? (cost / maxMonthlyCost) * 100 : 0;

                    return (
                        <div key={month} className="flex items-center gap-3 sm:gap-4 text-sm">
                            <span className="font-semibold text-slate-600 dark:text-slate-400 w-10 text-right">{month}</span>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-3">
                                <div
                                    className="bg-gradient-to-r from-indigo-500 to-teal-500 h-3 rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${widthPercentage}%` }}
                                />
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-200 w-24 text-left">
                                ${cost.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );
};

export default CostSummary;
