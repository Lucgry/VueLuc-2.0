import React, { useState } from 'react';
import type { Flight, Trip } from '../types';
import { AerolineasLogo } from './icons/AerolineasLogo';
import { JetSmartLogo } from './icons/JetSmartLogo';
import { StarIcon } from './icons/StarIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ShareIcon } from './icons/ShareIcon';

const TicketIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-1.5h5.25m-5.25 0h5.25m-5.25-2.25h5.25m-5.25 2.25h5.25M9 7.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 9 7.5Zm-5.25 9a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H4.5a.75.75 0 0 1-.75-.75Z" />
  </svg>
);

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatCompactDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    // Use replace to remove potential trailing dot in short month format
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    }).replace(/\.$/, '');
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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

const AirlineLogo: React.FC<{ airline: string | null; size?: 'sm' | 'md' }> = ({ airline, size = 'md' }) => {
    if (!airline) return null;
    
    const sizeClasses = {
        sm: 'h-8 w-8', // Consistent size for icons
        md: 'h-8 w-8'
    };

    const lowerCaseAirline = airline.toLowerCase();
    
    if (lowerCaseAirline.includes('aerolineas')) {
        return <AerolineasLogo className={`${sizeClasses[size]} text-[#00A1DE]`} />;
    }
    if (lowerCaseAirline.includes('jetsmart') || lowerCaseAirline.includes('jet smart')) {
        return <JetSmartLogo className={sizeClasses[size]} />;
    }
    return <span className="text-sm font-semibold">{airline}</span>;
};

const FlightInfo: React.FC<{ flight: Flight; type: 'Ida' | 'Vuelta' }> = ({ flight, type }) => {
  if (!flight) return null;

  return (
    <div className="flex-1">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          <TicketIcon className="h-5 w-5" />
          <span>{type}</span>
        </div>
        <AirlineLogo airline={flight.airline} />
      </div>
      
      <div className="text-center text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 capitalize">
        {formatDate(flight.departureDateTime)}
      </div>

      <div className="flex items-center justify-between space-x-2">
        <div className="text-center">
          <p className="text-2xl font-bold">{formatTime(flight.departureDateTime)}</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{flight.departureAirportCode}</p>
        </div>
        <div className="flex-1 text-center text-slate-500">
            <div className="border-t-2 border-dashed border-slate-300 dark:border-slate-600"></div>
            <p className="text-xs -mt-2 bg-white dark:bg-slate-800 px-1 inline-block">{flight.flightNumber}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{formatTime(flight.arrivalDateTime)}</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{flight.arrivalAirportCode}</p>
        </div>
      </div>
       <div className="text-center text-xs text-slate-500 dark:text-slate-400 mt-1">
            {flight.departureCity} &rarr; {flight.arrivalCity}
        </div>
    </div>
  );
};

interface TripCardProps {
  trip: Trip;
  onDelete: () => void;
  isPast: boolean;
  isNext: boolean;
}

const TripCard: React.FC<TripCardProps> = ({ trip, onDelete, isPast, isNext }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    
    const idaFlight = trip.departureFlight;
    const vueltaFlight = trip.returnFlight;
    const idaDate = idaFlight?.departureDateTime;
    const vueltaDate = vueltaFlight?.departureDateTime;
    const tripDate = idaDate || vueltaDate;

    const getStatus = () => {
        if (isPast) return { text: 'Completado', Icon: CheckCircleIcon, color: 'text-green-500' };
        if (isNext) return { text: 'Próximo Viaje', Icon: StarIcon, color: 'text-amber-500 animate-pulse' };
        if (!idaFlight || !vueltaFlight) return { text: 'Tramo único', Icon: ExclamationTriangleIcon, color: 'text-orange-500' };
        return null;
    }
    const status = getStatus();
    
    // For collapsed view, show the first available airline logo
    const primaryAirline = trip.departureFlight?.airline || trip.returnFlight?.airline;

    let tripTypeText: string;
    if (idaFlight && vueltaFlight) {
        tripTypeText = 'Ida y Vuelta';
    } else if (idaFlight) {
        tripTypeText = 'Ida';
    } else if (vueltaFlight) {
        tripTypeText = 'Vuelta';
    } else {
        tripTypeText = 'Viaje'; // Fallback
    }
    
    const generateShareableText = (tripToShare: Trip): string => {
        const { departureFlight, returnFlight, bookingReference } = tripToShare;
        
        let text = `✈️ Viaje a ${departureFlight?.arrivalCity || returnFlight?.departureCity || 'Destino'} (VueLuc 2.0)\n`;
        text += `Reserva: ${bookingReference || 'N/A'}\n\n`;

        if (departureFlight) {
            text += '🛫 IDA:\n';
            text += `${departureFlight.airline || ''} (Vuelo ${departureFlight.flightNumber || ''})\n`;
            text += `🗓️ ${formatDate(departureFlight.departureDateTime)}\n`;
            text += `Sale ${departureFlight.departureCity} (${departureFlight.departureAirportCode}) a las ${formatTime(departureFlight.departureDateTime)} hs\n`;
            text += `Llega ${departureFlight.arrivalCity} (${departureFlight.arrivalAirportCode}) a las ${formatTime(departureFlight.arrivalDateTime)} hs\n\n`;
        }

        if (returnFlight) {
            text += '🛬 VUELTA:\n';
            text += `${returnFlight.airline || ''} (Vuelo ${returnFlight.flightNumber || ''})\n`;
            text += `🗓️ ${formatDate(returnFlight.departureDateTime)}\n`;
            text += `Sale ${returnFlight.departureCity} (${returnFlight.departureAirportCode}) a las ${formatTime(returnFlight.departureDateTime)} hs\n`;
            text += `Llega ${returnFlight.arrivalCity} (${returnFlight.arrivalAirportCode}) a las ${formatTime(returnFlight.arrivalDateTime)} hs\n`;
        }
        
        return text.trim();
    };

    const handleShare = async () => {
        const shareText = generateShareableText(trip);
        const shareData = {
            title: `Viaje a ${trip.departureFlight?.arrivalCity || 'Destino'}`,
            text: shareText,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                console.error('Error al compartir:', error);
            }
        } else {
            // Fallback to clipboard
            try {
                await navigator.clipboard.writeText(shareText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (error) {
                console.error('Error al copiar al portapapeles:', error);
                alert('No se pudo copiar. Por favor, hazlo manualmente.');
            }
        }
    };


    return (
        <div className={`relative bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 transition-all duration-300 ${isPast ? 'opacity-60 hover:opacity-100' : ''} ${isNext ? 'ring-2 ring-indigo-500 animate-pulse-glow' : ''}`}>
            {/* Clickable Header for Collapsed View & Toggle */}
            <div 
                className="flex justify-between items-center p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Left Side: Date & Status */}
                 <div className="flex items-center space-x-4">
                     <div>
                        <div className="font-bold text-lg text-slate-800 dark:text-slate-200 capitalize">
                           {idaFlight && vueltaFlight ? (
                                <span>{formatCompactDate(idaDate)} &rarr; {formatCompactDate(vueltaDate)}</span>
                           ) : (
                                <span>{formatDate(idaDate || vueltaDate)}</span>
                           )}
                        </div>
                        {status && (
                             <div className={`flex items-center space-x-1.5 text-xs font-semibold mt-1 ${status.color}`}>
                                <status.Icon className="h-4 w-4" />
                                <span>{status.text}</span>
                            </div>
                        )}
                    </div>
                 </div>

                {/* Right Side: Logo, Time, Ref, Chevron */}
                <div className="flex items-center space-x-3 md:space-x-4">
                    <AirlineLogo airline={primaryAirline} size="sm" />
                    <div className="text-right">
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatTime(tripDate)}</p>
                        <div className="flex items-center justify-end space-x-2 mt-0.5">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{tripTypeText}</p>
                            {trip.bookingReference && <p className="font-mono bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-md text-xs font-semibold">{trip.bookingReference}</p>}
                        </div>
                    </div>
                    <ChevronDownIcon className={`h-6 w-6 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Expandable Details Section */}
            <div className={`transition-[max-height] duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px]' : 'max-h-0'}`}>
                <div className="px-4 pb-4">
                    <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4">
                         <div className="flex flex-col md:flex-row md:space-x-6 space-y-4 md:space-y-0">
                            {idaFlight && <FlightInfo flight={idaFlight} type="Ida" />}
                            {idaFlight && vueltaFlight && (
                            <div className="border-r border-dashed border-slate-300 dark:border-slate-600 hidden md:block"></div>
                            )}
                            {vueltaFlight && <FlightInfo flight={vueltaFlight} type="Vuelta" />}
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                        <div className="text-sm space-y-1 text-slate-600 dark:text-slate-300">
                           {trip.totalCost != null && <p><strong>Costo:</strong> ${trip.totalCost.toLocaleString('es-AR')}</p>}
                           {trip.paymentMethod && <p><strong>Forma de pago:</strong> {formatPaymentMethod(trip.paymentMethod)}</p>}
                        </div>
                        <div className="flex items-center space-x-2">
                             <button onClick={handleShare} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2 rounded-lg transition text-sm flex items-center space-x-2 font-semibold bg-slate-200/50 hover:bg-indigo-100 dark:bg-slate-700/50 dark:hover:bg-indigo-900/40">
                                 <ShareIcon className="h-4 w-4" />
                                 <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
                            </button>
                            <button onClick={onDelete} className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-2 rounded-lg transition text-sm flex items-center space-x-2 font-semibold bg-slate-200/50 hover:bg-red-100 dark:bg-slate-700/50 dark:hover:bg-red-900/40">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                 <span>Eliminar</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TripCard;