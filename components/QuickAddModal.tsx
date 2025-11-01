import React, { useState, useEffect } from 'react';
import type { Trip, Flight } from '../types';
import { PencilSquareIcon } from './icons/PencilSquareIcon';
import { Spinner } from './Spinner';

interface QuickAddModalProps {
  onClose: () => void;
  onAddTrip: (newTrip: Omit<Trip, 'id' | 'createdAt'>) => void;
}

const getNextDayOfWeek = (dayOfWeek: number): Date => { // 0=Sun, 1=Mon, ..., 6=Sat
    const today = new Date();
    const currentDay = today.getDay();
    let daysToAdd = dayOfWeek - currentDay;
    if (daysToAdd <= 0) {
        daysToAdd += 7;
    }
    today.setDate(today.getDate() + daysToAdd);
    return today;
};


const formatDateForInput = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    const shifted = new Date(date.getTime() - (offset * 60 * 1000));
    return shifted.toISOString().split('T')[0];
}

interface FlightData {
    flightNum: string;
    airline: string;
    depCode: string;
    depCity: string;
    arrCode: string;
    arrCity: string;
    depDate: string;
    depTime: string;
    arrDate: string;
    arrTime: string;
    cost: string;
    paymentMethod: string;
}

const initialIdaData: FlightData = {
    flightNum: '', airline: '', depCode: 'SLA', depCity: 'Salta', arrCode: 'AEP', arrCity: 'Buenos Aires',
    depDate: formatDateForInput(getNextDayOfWeek(2)), depTime: '11:00',
    arrDate: formatDateForInput(getNextDayOfWeek(2)), arrTime: '13:05',
    cost: '', paymentMethod: 'Débito Macro'
};

const initialVueltaData: FlightData = {
    flightNum: '', airline: '', depCode: 'AEP', depCity: 'Buenos Aires', arrCode: 'SLA', arrCity: 'Salta',
    depDate: formatDateForInput(getNextDayOfWeek(5)), depTime: '19:30',
    arrDate: formatDateForInput(getNextDayOfWeek(5)), arrTime: '21:35',
    cost: '', paymentMethod: 'Débito Macro'
};

const paymentOptions = ['Débito Macro', 'Débito Ciudad', 'Crédito Macro', 'Crédito Ciudad', 'Crédito Yoy'];
const inputClasses = "w-full p-2 border-none rounded-md bg-slate-100 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 transition shadow-neumo-light-in dark:shadow-neumo-dark-in";

const FlightFieldSet: React.FC<{
    title: string;
    data: FlightData;
    setData: React.Dispatch<React.SetStateAction<FlightData>>;
}> = ({ title, data, setData }) => {

    const handleInputChange = (field: keyof FlightData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setData(prev => ({ ...prev, [field]: value }));
    };

    useEffect(() => {
        const normalizedFlightNum = data.flightNum.trim().toLowerCase();
        if (normalizedFlightNum.startsWith('ar')) {
            setData(prev => ({ ...prev, airline: 'Aerolineas Argentinas' }));
        } else if (normalizedFlightNum.startsWith('wj')) {
            setData(prev => ({ ...prev, airline: 'JetSmart' }));
        }
    }, [data.flightNum]);

    return (
        <fieldset className="p-4 rounded-lg shadow-neumo-light-in dark:shadow-neumo-dark-in space-y-3">
            <legend className="px-2 font-semibold text-indigo-600 dark:text-indigo-400">{title}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Nº de Vuelo</label><input type="text" value={data.flightNum} onChange={handleInputChange('flightNum')} placeholder="AR1451" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Aerolínea</label><input type="text" value={data.airline} onChange={handleInputChange('airline')} placeholder="Aerolineas Argentinas" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Cód. Origen</label><input type="text" value={data.depCode} onChange={handleInputChange('depCode')} placeholder="SLA" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Cód. Destino</label><input type="text" value={data.arrCode} onChange={handleInputChange('arrCode')} placeholder="AEP" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ciudad Origen</label><input type="text" value={data.depCity} onChange={handleInputChange('depCity')} placeholder="Salta" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Ciudad Destino</label><input type="text" value={data.arrCity} onChange={handleInputChange('arrCity')} placeholder="Buenos Aires" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Fecha Salida</label><input type="date" value={data.depDate} onChange={handleInputChange('depDate')} className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Hora Salida</label><input type="time" value={data.depTime} onChange={handleInputChange('depTime')} className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Fecha Llegada</label><input type="date" value={data.arrDate} onChange={handleInputChange('arrDate')} className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Hora Llegada</label><input type="time" value={data.arrTime} onChange={handleInputChange('arrTime')} className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Costo</label><input type="number" step="0.01" value={data.cost} onChange={handleInputChange('cost')} placeholder="0.00" className={inputClasses} /></div>
                <div><label className="text-xs font-medium text-slate-600 dark:text-slate-400">Método de Pago</label><select value={data.paymentMethod} onChange={handleInputChange('paymentMethod')} className={inputClasses}>{paymentOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
            </div>
        </fieldset>
    );
};


const QuickAddModal: React.FC<QuickAddModalProps> = ({ onClose, onAddTrip }) => {
    const [idaData, setIdaData] = useState<FlightData>(initialIdaData);
    const [vueltaData, setVueltaData] = useState<FlightData>(initialVueltaData);
    const [bookingRef, setBookingRef] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const createFlightObject = (data: FlightData): Flight | null => {
            if (!data.flightNum.trim() || !data.depCode.trim() || !data.arrCode.trim() || !data.depDate.trim() || !data.depTime.trim() || !data.arrDate.trim() || !data.arrTime.trim()) {
                return null;
            }
            const [depHours, depMinutes] = data.depTime.split(':').map(Number);
            const depDateTime = new Date(`${data.depDate}T00:00:00.000Z`);
            depDateTime.setUTCHours(depHours, depMinutes, 0, 0);

            const [arrHours, arrMinutes] = data.arrTime.split(':').map(Number);
            const arrDateTime = new Date(`${data.arrDate}T00:00:00.000Z`);
            arrDateTime.setUTCHours(arrHours, arrMinutes, 0, 0);

            return {
                flightNumber: data.flightNum.toUpperCase(),
                airline: data.airline.trim(),
                departureAirportCode: data.depCode.toUpperCase(),
                departureCity: data.depCity.trim(),
                arrivalAirportCode: data.arrCode.toUpperCase(),
                arrivalCity: data.arrCity.trim(),
                departureDateTime: depDateTime.toISOString(),
                arrivalDateTime: arrDateTime.toISOString(),
                cost: data.cost ? parseFloat(data.cost) : null,
                paymentMethod: data.paymentMethod
            };
        };

        const departureFlight = createFlightObject(idaData);
        const returnFlight = createFlightObject(vueltaData);
        
        if (!bookingRef.trim()) {
            setError('El código de reserva es obligatorio.');
            setIsLoading(false);
            return;
        }

        if (!departureFlight && !returnFlight) {
            setError('Debes completar los datos de al menos un tramo (ida o vuelta).');
            setIsLoading(false);
            return;
        }

        try {
            const newTrip: Omit<Trip, 'id' | 'createdAt'> = {
                departureFlight,
                returnFlight,
                bookingReference: bookingRef.toUpperCase(),
            };
            onAddTrip(newTrip);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear el viaje.');
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out w-full max-w-3xl transform transition-all flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    {/* --- HEADER --- */}
                    <div className="p-6 md:p-8 flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-start sm:items-center space-x-4">
                            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out mt-1 sm:mt-0">
                                <PencilSquareIcon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Agregar Viaje Manualmente</h2>
                                <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Completa todos los detalles de tu reserva.</p>
                            </div>
                        </div>
                    </div>

                    {/* --- SCROLLABLE CONTENT --- */}
                    <div className="overflow-y-auto flex-grow min-h-0">
                        <div className="px-6 md:px-8 py-4">
                            <div className="space-y-4">
                               <FlightFieldSet title="✈️ Ida" data={idaData} setData={setIdaData} />
                               <FlightFieldSet title="✈️ Vuelta" data={vueltaData} setData={setVueltaData} />
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
                                {isLoading ? <Spinner /> : 'Guardar Viaje'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default QuickAddModal;