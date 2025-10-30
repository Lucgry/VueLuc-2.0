import React, { useState } from 'react';
import type { Trip, Flight } from '../types';
import { BoltIcon } from './icons/BoltIcon';
import { Spinner } from './Spinner';

interface QuickAddModalProps {
  onClose: () => void;
  onAddTrip: (newTrip: Omit<Trip, 'id' | 'createdAt'>) => void;
}

const getNextDayOfWeek = (dayOfWeek: number): Date => { // 0=Sun, 1=Mon, ..., 6=Sat
    const today = new Date();
    today.setDate(today.getDate() + (dayOfWeek - today.getDay() + 7) % 7);
    if (today < new Date()) {
        today.setDate(today.getDate() + 7);
    }
    return today;
};

const formatDateForInput = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    const shifted = new Date(date.getTime() - (offset*60*1000));
    return shifted.toISOString().split('T')[0];
}


const QuickAddModal: React.FC<QuickAddModalProps> = ({ onClose, onAddTrip }) => {
    const [idaDate, setIdaDate] = useState(formatDateForInput(getNextDayOfWeek(2))); // Default to next Tuesday
    const [idaFlightNum, setIdaFlightNum] = useState('');
    const [idaTime, setIdaTime] = useState('11:00');
    const [idaCost, setIdaCost] = useState('');
    const [idaPaymentMethod, setIdaPaymentMethod] = useState('Débito Macro');

    const [vueltaDate, setVueltaDate] = useState(formatDateForInput(getNextDayOfWeek(5))); // Default to next Friday
    const [vueltaFlightNum, setVueltaFlightNum] = useState('');
    const [vueltaTime, setVueltaTime] = useState('19:30');
    const [vueltaCost, setVueltaCost] = useState('');
    const [vueltaPaymentMethod, setVueltaPaymentMethod] = useState('Débito Macro');
    
    const [bookingRef, setBookingRef] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const paymentOptions = [
        'Débito Macro',
        'Débito Ciudad',
        'Crédito Macro',
        'Crédito Ciudad',
        'Crédito Yoy'
    ];
    
    const inputClasses = "w-full p-2 border-none rounded-md bg-slate-100 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 transition shadow-neumo-light-in dark:shadow-neumo-dark-in";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const isIdaFilled = idaFlightNum.trim() !== '' && idaDate.trim() !== '' && idaTime.trim() !== '';
        const isVueltaFilled = vueltaFlightNum.trim() !== '' && vueltaDate.trim() !== '' && vueltaTime.trim() !== '';
        
        if (!bookingRef.trim()) {
            setError('El código de reserva es obligatorio.');
            setIsLoading(false);
            return;
        }

        if (!isIdaFilled && !isVueltaFilled) {
            setError('Debes completar los datos de al menos un tramo (ida o vuelta).');
            setIsLoading(false);
            return;
        }

        try {
            const newTrip: Omit<Trip, 'id' | 'createdAt'> = {
                departureFlight: null,
                returnFlight: null,
                bookingReference: bookingRef.toUpperCase(),
            };
            
            if (isIdaFilled) {
                const [idaHours, idaMinutes] = idaTime.split(':').map(Number);
                const departureDateTime = new Date(`${idaDate}T00:00:00.000Z`);
                departureDateTime.setUTCHours(idaHours, idaMinutes, 0, 0);

                const idaArrivalDateTime = new Date(departureDateTime);
                idaArrivalDateTime.setUTCHours(departureDateTime.getUTCHours() + 2, departureDateTime.getUTCMinutes() + 5);

                newTrip.departureFlight = {
                    flightNumber: idaFlightNum.toUpperCase(),
                    airline: idaFlightNum.toLowerCase().startsWith('ar') ? 'Aerolineas Argentinas' : 'JetSmart',
                    departureAirportCode: 'SLA',
                    departureCity: 'Salta',
                    arrivalAirportCode: 'AEP',
                    arrivalCity: 'Buenos Aires',
                    departureDateTime: departureDateTime.toISOString(),
                    arrivalDateTime: idaArrivalDateTime.toISOString(),
                    cost: idaCost ? parseFloat(idaCost) : null,
                    paymentMethod: idaPaymentMethod
                };
            }

            if (isVueltaFilled) {
                const [vueltaHours, vueltaMinutes] = vueltaTime.split(':').map(Number);
                const returnDateTime = new Date(`${vueltaDate}T00:00:00.000Z`);
                returnDateTime.setUTCHours(vueltaHours, vueltaMinutes, 0, 0);

                const vueltaArrivalDateTime = new Date(returnDateTime);
                vueltaArrivalDateTime.setUTCHours(returnDateTime.getUTCHours() + 2, vueltaArrivalDateTime.getUTCMinutes() + 5);
                
                newTrip.returnFlight = {
                    flightNumber: vueltaFlightNum.toUpperCase(),
                    airline: vueltaFlightNum.toLowerCase().startsWith('ar') ? 'Aerolineas Argentinas' : 'JetSmart',
                    departureAirportCode: 'AEP',
                    departureCity: 'Buenos Aires',
                    arrivalAirportCode: 'SLA',
                    arrivalCity: 'Salta',
                    departureDateTime: returnDateTime.toISOString(),
                    arrivalDateTime: vueltaArrivalDateTime.toISOString(),
                    cost: vueltaCost ? parseFloat(vueltaCost) : null,
                    paymentMethod: vueltaPaymentMethod,
                };
            }

            onAddTrip(newTrip);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear el viaje.');
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out w-full max-w-2xl transform transition-all flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    {/* --- HEADER --- */}
                    <div className="p-6 md:p-8 flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-start sm:items-center space-x-4">
                            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out mt-1 sm:mt-0">
                                <BoltIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Agregado Rápido</h2>
                                <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Crea tu viaje de rutina en segundos.</p>
                            </div>
                        </div>
                    </div>

                    {/* --- SCROLLABLE CONTENT --- */}
                    <div className="overflow-y-auto flex-grow min-h-0">
                        <div className="px-6 md:px-8 py-4">
                            <p className="text-sm text-slate-500 dark:text-slate-400 p-3 rounded-md mb-4 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                                Completa los detalles para el vuelo de <b>ida</b> y/o <b>vuelta</b>. Si es un viaje de un solo tramo, simplemente deja los campos del otro tramo en blanco.
                            </p>

                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* VUELO IDA */}
                                    <fieldset className="p-3 rounded-md shadow-neumo-light-in dark:shadow-neumo-dark-in space-y-3">
                                        <legend className="px-2 font-semibold text-indigo-600 dark:text-indigo-400">✈️ Ida</legend>
                                        <input type="date" value={idaDate} onChange={e => setIdaDate(e.target.value)} className={inputClasses} />
                                        <input type="text" value={idaFlightNum} onChange={e => setIdaFlightNum(e.target.value)} placeholder="Nº de Vuelo" className={inputClasses} />
                                        <input type="time" value={idaTime} onChange={e => setIdaTime(e.target.value)} className={inputClasses} />
                                        <input type="number" step="0.01" value={idaCost} onChange={e => setIdaCost(e.target.value)} placeholder="Costo Ida" className={inputClasses} />
                                        <select value={idaPaymentMethod} onChange={e => setIdaPaymentMethod(e.target.value)} className={inputClasses}>
                                            {paymentOptions.map(o => <option key={`ida-${o}`} value={o}>{o}</option>)}
                                        </select>
                                    </fieldset>
                                    {/* VUELO VUELTA */}
                                    <fieldset className="p-3 rounded-md shadow-neumo-light-in dark:shadow-neumo-dark-in space-y-3">
                                        <legend className="px-2 font-semibold text-indigo-600 dark:text-indigo-400">✈️ Vuelta</legend>
                                        <input type="date" value={vueltaDate} onChange={e => setVueltaDate(e.target.value)} className={inputClasses} />
                                        <input type="text" value={vueltaFlightNum} onChange={e => setVueltaFlightNum(e.target.value)} placeholder="Nº de Vuelo" className={inputClasses} />
                                        <input type="time" value={vueltaTime} onChange={e => setVueltaTime(e.target.value)} className={inputClasses} />
                                        <input type="number" step="0.01" value={vueltaCost} onChange={e => setVueltaCost(e.target.value)} placeholder="Costo Vuelta" className={inputClasses} />
                                        <select value={vueltaPaymentMethod} onChange={e => setVueltaPaymentMethod(e.target.value)} className={inputClasses}>
                                            {paymentOptions.map(o => <option key={`vuelta-${o}`} value={o}>{o}</option>)}
                                        </select>
                                    </fieldset>
                                </div>
                                <div className="pt-2">
                                    <label htmlFor="booking-ref" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Código de Reserva</label>
                                    <input id="booking-ref" type="text" value={bookingRef} onChange={e => setBookingRef(e.target.value)} placeholder="Código único o combinado" className={inputClasses} required />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- FOOTER --- */}
                    <div className="p-6 md:p-8 flex-shrink-0 border-t border-slate-200 dark:border-slate-700">
                        {error && <p className="text-red-500 text-sm mb-3 text-center sm:text-left">{error}</p>}
                        <div className="flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-4">
                             <button type="button" onClick={onClose} className="w-full sm:w-auto px-4 py-2 text-slate-800 dark:text-slate-200 rounded-md transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in" disabled={isLoading}>
                                Cancelar
                            </button>
                            <button type="submit" className="w-full sm:w-auto px-6 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-semibold rounded-md disabled:opacity-60 transition-shadow duration-200 flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in" disabled={isLoading}>
                                {isLoading ? <Spinner /> : 'Agregar Viaje'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default QuickAddModal;