import React, { useMemo, useState } from 'react';
import type { Trip } from '../types';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { CurrencyIcon } from './icons/CurrencyIcon';

interface CostSummaryProps {
  trips: Trip[];
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; gradient: string }> = ({ icon, label, value, gradient }) => (
    <div className="flex-1 p-4 rounded-xl flex items-center space-x-4 bg-slate-100 dark:bg-slate-800 shadow-neumo-light-out dark:shadow-neumo-dark-out">
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
  
  // Return the formatted name if it's already one of the standards, otherwise return the raw string.
  const standards = ['Débito Macro', 'Débito Ciudad', 'Crédito Macro', 'Crédito Ciudad', 'Crédito Yoy'];
  if (standards.includes(paymentMethod)) return paymentMethod;

  return paymentMethod;
};

const CostSummary: React.FC<CostSummaryProps> = ({ trips }) => {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const availableYears = useMemo(() => {
        const yearsSet = trips.reduce((acc, trip) => {
            const costDateStr = trip.purchaseDate || trip.createdAt;
            if (costDateStr) {
                const year = new Date(costDateStr).getFullYear();
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
            const costDateStr = trip.purchaseDate || trip.createdAt;
            return costDateStr ? new Date(costDateStr).getFullYear() === selectedYear : false;
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
                    const formattedMethod = formatPaymentMethod(flight.paymentMethod);
                    if (formattedMethod !== 'N/A') {
                        costsByMethod[formattedMethod] = (costsByMethod[formattedMethod] || 0) + flight.cost;
                    }
                }
            });
        });

        return Object.entries(costsByMethod)
            .map(([method, total]) => ({ method, total }))
            .sort((a, b) => b.total - a.total);
    }, [tripsForSelectedYear]);
    
    const monthlyBreakdown = useMemo(() => {
        const costsByMonth: { [monthIndex: number]: number } = {};

        for (const trip of tripsForSelectedYear) {
            // Regla de negocio: La fecha que rige el gasto es la fecha de compra del pasaje.
            const costDateStr = trip.purchaseDate || trip.createdAt;
            if (!costDateStr) continue;

            const purchaseDate = new Date(costDateStr);
            const monthIndex = purchaseDate.getMonth(); // 0 para Enero, 11 para Diciembre
            if (isNaN(monthIndex)) continue;
            
            // Suma el costo total del viaje
            const totalTripCost = (trip.departureFlight?.cost || 0) + (trip.returnFlight?.cost || 0);

            // Acumula el costo en el mes correspondiente a la compra.
            if (totalTripCost > 0) {
                costsByMonth[monthIndex] = (costsByMonth[monthIndex] || 0) + totalTripCost;
            }
        }
        
        const allMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        return allMonths.map((name, index) => ({
            name,
            cost: costsByMonth[index] || 0,
        }));
    }, [tripsForSelectedYear]);

    const maxMonthlyCost = Math.max(...monthlyBreakdown.map(m => m.cost), 1); // Avoid division by zero


    if (trips.length === 0) {
        return (
            <div className="text-center py-20 px-6 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
                <CalculatorIcon className="mx-auto h-16 w-16 text-slate-500 dark:text-slate-400" />
                <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-white">Sin Datos de Costos</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">Agrega viajes para comenzar a analizar tus gastos.</p>
            </div>
        );
    }
  
    return (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out p-4 md:p-6 space-y-8">
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Resumen Anual</h3>
                <select 
                    value={selectedYear} 
                    onChange={e => setSelectedYear(parseInt(e.target.value))}
                    className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-neumo-light-out dark:shadow-neumo-dark-out appearance-none"
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
                    value={`$${totalCostForYear.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">{method}</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-100">${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-2 shadow-neumo-light-in dark:shadow-neumo-dark-in">
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
            <h3 className="text-xl font-bold mb-4">Desglose Mensual (por Fecha de Compra)</h3>
            <div className="space-y-3">
                {monthlyBreakdown.map(({ name, cost }) => {
                    if (cost === 0 && tripsForSelectedYear.length > 0) return null;

                    const widthPercentage = maxMonthlyCost > 0 ? (cost / maxMonthlyCost) * 100 : 0;

                    return (
                        <div key={name} className="flex items-center gap-3 sm:gap-4 text-sm">
                            <span className="font-semibold text-slate-600 dark:text-slate-400 w-10 text-right">{name}</span>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-700/50 rounded-full h-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                                <div
                                    className="bg-gradient-to-r from-indigo-500 to-teal-500 h-3 rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${widthPercentage}%` }}
                                />
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-200 w-24 text-left">
                                ${cost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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