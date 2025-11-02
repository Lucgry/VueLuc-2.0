import React, { useState, useEffect, useRef } from 'react';
import type { Flight, Trip, BoardingPassData } from '../types';
import { AirlineLogo } from './AirlineLogo';
import { StarIcon } from './icons/StarIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ShareIcon } from './icons/ShareIcon';
import { saveBoardingPass, getBoardingPass, deleteBoardingPass } from '../services/db';
import BoardingPassViewer from './BoardingPassViewer';
import { DocumentPlusIcon } from './icons/DocumentPlusIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { TrashIcon } from './icons/TrashIcon';
import { Spinner } from './Spinner';


const TicketIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24" strokeWidth={1.5} stroke="currentColor" {...props}>
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

const FlightInfo: React.FC<{ flight: Flight; type: 'Ida' | 'Vuelta' }> = ({ flight, type }) => {
  if (!flight) return null;

  return (
    <div className="flex-1">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          <TicketIcon className="h-5 w-5" />
          <span>{type}</span>
        </div>
      </div>
      
      <div className="text-center text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 capitalize">
        {formatDate(flight.departureDateTime)}
      </div>

      <div className="flex items-center justify-between space-x-2">
        <div className="text-center">
          <p className="text-2xl font-bold">{formatTime(flight.departureDateTime)}</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{flight.departureAirportCode}</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
             <div className="w-full h-px bg-slate-300 dark:bg-slate-700/50"></div>
             <div className="text-center -mt-4">
                <div className="p-1 rounded-full bg-slate-100/50 dark:bg-slate-900/50">
                    <AirlineLogo airline={flight.airline} size="sm" type="isotipo" />
                </div>
                {flight.flightNumber && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{flight.flightNumber}</p>}
             </div>
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
  userId: string;
}

type DeletionState = 'idle' | 'confirming' | 'deleting';

const TripCard: React.FC<TripCardProps> = ({ trip, onDelete, isPast, isNext, userId }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [passStatus, setPassStatus] = useState<{ ida: boolean | 'loading', vuelta: boolean | 'loading' }>({ ida: 'loading', vuelta: 'loading' });
    const [deletingStatus, setDeletingStatus] = useState<{ ida: DeletionState, vuelta: DeletionState }>({ ida: 'idle', vuelta: 'idle' });
    const [tripDeletionState, setTripDeletionState] = useState<'idle' | 'confirming'>('idle');
    const [viewingBoardingPass, setViewingBoardingPass] = useState<BoardingPassData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const flightTypeToUpload = useRef<'ida' | 'vuelta' | null>(null);

    const idaFlight = trip.departureFlight;
    const vueltaFlight = trip.returnFlight;

    const getStatus = () => {
        if (isPast) return { 
            type: 'bar' as const,
            text: 'Completado', 
            Icon: CheckCircleIcon, 
            barClass: 'bg-green-100 dark:bg-green-500/20', 
            textClass: 'text-green-800 dark:text-green-200 font-semibold',
            iconColor: 'text-green-600 dark:text-green-300'
        };
        if (isNext) return { 
            type: 'bar' as const,
            text: 'Próximo Viaje', 
            Icon: StarIcon, 
            barClass: 'bg-amber-100 dark:bg-amber-500/20',
            textClass: 'text-amber-800 dark:text-amber-200 font-semibold',
            iconColor: 'text-amber-600 dark:text-amber-400'
        };
        if (!idaFlight || !vueltaFlight) return { 
            type: 'pill' as const,
            text: 'Tramo único', 
            Icon: ExclamationTriangleIcon, 
            color: 'text-orange-800 dark:text-orange-200', 
            bg: 'bg-orange-100 dark:bg-orange-500/20' 
        };
        return null;
    }

    useEffect(() => {
        if (isExpanded) {
            setPassStatus({ ida: 'loading', vuelta: 'loading' });
            const checkPasses = async () => {
                try {
                    const [idaResult, vueltaResult] = await Promise.all([
                        getBoardingPass(userId, trip.id, 'ida'),
                        getBoardingPass(userId, trip.id, 'vuelta'),
                    ]);
                    setPassStatus({ ida: idaResult.exists, vuelta: vueltaResult.exists });
                } catch (error) {
                    console.error("Error checking for boarding passes, likely a permissions issue:", error);
                    setPassStatus({ ida: false, vuelta: false });
                }
            };
            checkPasses();
        }
    }, [trip.id, isExpanded, userId]);

    const handleAddBoardingPassClick = (e: React.MouseEvent, flightType: 'ida' | 'vuelta') => {
        e.stopPropagation();
        flightTypeToUpload.current = flightType;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        const flightType = flightTypeToUpload.current;
        if (file && flightType) {
            setPassStatus(prev => ({ ...prev, [flightType]: 'loading' }));
            try {
                await saveBoardingPass(userId, trip.id, flightType, file);
                setPassStatus(prev => ({ ...prev, [flightType]: true }));
            } catch (error) {
                console.error("Error saving boarding pass:", error);
                alert("No se pudo guardar la tarjeta de embarque.");
                setPassStatus(prev => ({ ...prev, [flightType]: false }));
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };
    
    const handleViewBoardingPass = async (e: React.MouseEvent, flightType: 'ida' | 'vuelta') => {
        e.stopPropagation();
        try {
            const { file, exists } = await getBoardingPass(userId, trip.id, flightType);
            if (exists && file) {
                const url = URL.createObjectURL(file);
                setViewingBoardingPass({ fileURL: url, fileType: file.type });
            } else {
                alert("No se encontró la tarjeta de embarque. Por favor, intente recargar.");
                setPassStatus(prev => ({ ...prev, [flightType]: false }));
            }
        } catch (error) {
            console.error("Error loading boarding pass:", error);
            alert("No se pudo cargar la tarjeta de embarque.");
        }
    };

    const handleDeleteBoardingPass = (e: React.MouseEvent, flightType: 'ida' | 'vuelta') => {
        e.stopPropagation();
        setDeletingStatus(prev => ({ ...prev, [flightType]: 'confirming' }));
    };
    
    const executeDelete = async (e: React.MouseEvent, flightType: 'ida' | 'vuelta') => {
        e.stopPropagation();
        setDeletingStatus(prev => ({ ...prev, [flightType]: 'deleting' }));
        try {
            await deleteBoardingPass(userId, trip.id, flightType);
            setPassStatus(prev => ({ ...prev, [flightType]: false }));
        } catch (error) {
            console.error("Error deleting boarding pass:", error);
            alert(`No se pudo eliminar la tarjeta de embarque.`);
        } finally {
            setDeletingStatus(prev => ({ ...prev, [flightType]: 'idle' }));
        }
    };

    const cancelDelete = (e: React.MouseEvent, flightType: 'ida' | 'vuelta') => {
        e.stopPropagation();
        setDeletingStatus(prev => ({ ...prev, [flightType]: 'idle' }));
    };
    
    const BoardingPassButton: React.FC<{flightType: 'ida' | 'vuelta'}> = ({flightType}) => {
        const status = passStatus[flightType];

        if (status === 'loading') {
            return (
                <div className="w-full flex items-center justify-center py-2">
                    <Spinner />
                </div>
            );
        }

        if (status) {
             if (deletingStatus[flightType] === 'confirming') {
                return (
                    <div className="flex items-center space-x-2 bg-red-100 dark:bg-red-900/50 p-2 rounded-lg">
                        <span className="text-sm font-semibold text-red-800 dark:text-red-200 flex-grow text-center">¿Seguro?</span>
                        <button onClick={(e) => executeDelete(e, flightType)} className="text-sm font-bold px-4 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition">Sí</button>
                        <button onClick={(e) => cancelDelete(e, flightType)} className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-400 dark:hover:bg-slate-500 transition">No</button>
                    </div>
                );
            }
            return (
                <div className="flex space-x-2">
                    <button 
                        onClick={(e) => handleViewBoardingPass(e, flightType)} 
                        className="flex-grow text-sm font-semibold flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-green-700 dark:text-green-300 bg-slate-200 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors duration-200"
                        disabled={deletingStatus[flightType] === 'deleting'}
                    >
                        <DocumentTextIcon className="h-5 w-5" /><span>Ver Tarjeta</span>
                    </button>
                    <button 
                        onClick={(e) => handleDeleteBoardingPass(e, flightType)} 
                        className="flex-shrink-0 p-2 rounded-lg text-red-500 dark:text-red-400 bg-slate-200 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors duration-200 flex items-center justify-center w-[40px]" 
                        aria-label={`Eliminar tarjeta de embarque de ${flightType}`}
                        disabled={deletingStatus[flightType] === 'deleting'}
                    >
                        {deletingStatus[flightType] === 'deleting' ? <Spinner /> : <TrashIcon className="h-5 w-5" />}
                    </button>
                </div>
            );
        }

        return (
            <button onClick={(e) => handleAddBoardingPassClick(e, flightType)} className="w-full text-sm font-semibold flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors duration-200">
                <DocumentPlusIcon className="h-5 w-5" /><span>Agregar Tarjeta</span>
            </button>
        );
    };

    const status = getStatus();
    
    const idaDate = idaFlight?.departureDateTime;
    const vueltaDate = vueltaFlight?.departureDateTime;
    const tripDate = idaDate || vueltaDate;
    
    const idaAirline = trip.departureFlight?.airline;
    const vueltaAirline = trip.returnFlight?.airline;
    const idaRef = trip.departureFlight?.bookingReference;
    const vueltaRef = trip.returnFlight?.bookingReference;
    
    const getNormalizedAirline = (name: string | null | undefined): string => {
        if (!name) return '';
        const lowerName = name.toLowerCase();
        if (lowerName.includes('aerolineas')) return 'aerolineas';
        if (lowerName.includes('jetsmart')) return 'jetsmart';
        return lowerName.trim();
    };

    const areAirlinesDifferent = idaAirline && vueltaAirline && getNormalizedAirline(idaAirline) !== getNormalizedAirline(vueltaAirline);

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
        const { departureFlight, returnFlight } = tripToShare;
        
        let text = `✈️ Viaje a ${departureFlight?.arrivalCity || returnFlight?.departureCity || 'Destino'} (VueLuc 2.0)\n\n`;

        if (departureFlight) {
            text += `🛫 IDA (Reserva: ${departureFlight.bookingReference || 'N/A'}):\n`;
            text += `${departureFlight.airline || ''} (Vuelo ${departureFlight.flightNumber || ''})\n`;
            text += `🗓️ ${formatDate(departureFlight.departureDateTime)}\n`;
            text += `Sale ${departureFlight.departureCity} (${departureFlight.departureAirportCode}) a las ${formatTime(departureFlight.departureDateTime)} hs\n`;
            text += `Llega ${departureFlight.arrivalCity} (${departureFlight.arrivalAirportCode}) a las ${formatTime(departureFlight.arrivalDateTime)} hs\n\n`;
        }

        if (returnFlight) {
            text += `🛬 VUELTA (Reserva: ${returnFlight.bookingReference || 'N/A'}):\n`;
            text += `${returnFlight.airline || ''} (Vuelo ${returnFlight.flightNumber || ''})\n`;
            text += `🗓️ ${formatDate(returnFlight.departureDateTime)}\n`;
            text += `Sale ${returnFlight.departureCity} (${returnFlight.departureAirportCode}) a las ${formatTime(returnFlight.departureDateTime)} hs\n`;
            text += `Llega ${returnFlight.arrivalCity} (${returnFlight.arrivalAirportCode}) a las ${formatTime(returnFlight.arrivalDateTime)} hs\n`;
        }
        
        return text.trim();
    };

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
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
        <>
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,application/pdf"
        />
        {viewingBoardingPass && (
            <BoardingPassViewer 
                fileURL={viewingBoardingPass.fileURL}
                fileType={viewingBoardingPass.fileType}
                onClose={() => {
                    if (viewingBoardingPass.fileURL.startsWith('blob:')) {
                        URL.revokeObjectURL(viewingBoardingPass.fileURL);
                    }
                    setViewingBoardingPass(null);
                }}
            />
        )}
        <div className={`relative bg-white dark:bg-slate-800 backdrop-blur-md rounded-xl transition-all duration-300 border border-slate-200 dark:border-slate-700 shadow-lg ${isPast ? 'opacity-70 hover:opacity-100' : ''} ${isNext ? 'next-trip-glow' : ''} overflow-hidden`}>
             <div 
                className="p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex flex-col space-y-2">
                    {/* --- Row 1: Date & Time --- */}
                    <div className="flex justify-between items-start">
                        <div className="font-bold text-lg text-slate-800 dark:text-slate-200 capitalize">
                           {idaFlight && vueltaFlight ? (
                                <span>{formatCompactDate(idaDate)} &rarr; {formatCompactDate(vueltaDate)}</span>
                           ) : (
                                <span>{formatDate(idaDate || vueltaDate)}</span>
                           )}
                        </div>
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatTime(tripDate)}</p>
                    </div>

                    {/* --- Row 2: Logos & Details --- */}
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                             {areAirlinesDifferent ? (
                                <>
                                    <AirlineLogo airline={idaAirline} size="sm" type="full" />
                                    <AirlineLogo airline={vueltaAirline} size="sm" type="full"/>
                                </>
                            ) : (
                                <AirlineLogo airline={idaAirline || vueltaAirline} size="sm" type="full" />
                            )}
                        </div>
                        <div className="flex items-center justify-end space-x-2">
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{tripTypeText}</p>
                             <div className="flex flex-wrap gap-1 justify-end">
                                {idaRef && <p className="font-mono bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md text-xs font-semibold">{idaRef}</p>}
                                {vueltaRef && idaRef?.trim().toUpperCase() !== vueltaRef?.trim().toUpperCase() && <p className="font-mono bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md text-xs font-semibold">{vueltaRef}</p>}
                            </div>
                            <ChevronDownIcon className={`h-6 w-6 text-slate-500 dark:text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                    </div>

                     {status && status.type === 'pill' && (
                         <div className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-2 py-1 rounded-full ${status.color} ${status.bg}`}>
                            <status.Icon className="h-4 w-4" />
                            <span>{status.text}</span>
                        </div>
                    )}
                </div>
            </div>

            {status && status.type === 'bar' && !isExpanded && (
                <div 
                    className={`px-4 py-2 cursor-pointer ${status.barClass}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className={`flex items-center space-x-1.5 text-sm ${status.textClass}`}>
                        <status.Icon className={`h-5 w-5 ${status.iconColor}`} />
                        <span>{status.text}</span>
                    </div>
                </div>
            )}


            <div className={`transition-[max-height] duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[800px]' : 'max-h-0'}`}>
                <div className="px-4 pb-4">
                    <div className="rounded-lg p-4 bg-slate-100/50 dark:bg-slate-900/50">
                         <div className="flex flex-col md:flex-row md:space-x-6 space-y-4 md:space-y-0">
                            {idaFlight && (
                                <div className="flex-1 space-y-3">
                                    <FlightInfo flight={idaFlight} type="Ida" />
                                    <BoardingPassButton flightType="ida" />
                                </div>
                            )}

                            {idaFlight && vueltaFlight && (
                            <div className="border-r border-dashed border-slate-300 dark:border-slate-700 hidden md:block"></div>
                            )}
                            
                            {vueltaFlight && (
                                <div className="flex-1 space-y-3">
                                    <FlightInfo flight={vueltaFlight} type="Vuelta" />
                                    <BoardingPassButton flightType="vuelta" />
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div className="text-sm space-y-1 text-slate-700 dark:text-slate-300 w-full sm:w-auto">
                           {idaFlight?.cost != null && (
                                <p><strong>Costo Ida:</strong> ${idaFlight.cost.toLocaleString('es-AR')} ({formatPaymentMethod(idaFlight.paymentMethod)})</p>
                           )}
                           {vueltaFlight?.cost != null && (
                                <p><strong>Costo Vuelta:</strong> ${vueltaFlight.cost.toLocaleString('es-AR')} ({formatPaymentMethod(vueltaFlight.paymentMethod)})</p>
                           )}
                        </div>
                        <div className="flex items-center space-x-2 w-full justify-end sm:w-auto">
                           {tripDeletionState === 'confirming' ? (
                                <div className="flex items-center space-x-2 bg-red-100 dark:bg-red-900/50 p-2 rounded-lg w-full justify-center">
                                    <span className="text-sm font-semibold text-red-800 dark:text-red-200">¿Eliminar?</span>
                                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-sm font-bold px-4 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition">Sí</button>
                                    <button onClick={(e) => { e.stopPropagation(); setTripDeletionState('idle'); }} className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-400 dark:hover:bg-slate-500 transition">No</button>
                                </div>
                           ) : (
                            <>
                             <button onClick={(e) => handleShare(e)} className="text-slate-600 dark:text-slate-300 p-2 rounded-lg transition text-sm flex items-center space-x-2 font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700/50 dark:hover:bg-slate-700">
                                 <ShareIcon className="h-4 w-4" />
                                 <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setTripDeletionState('confirming'); }} className="text-slate-600 dark:text-slate-300 p-2 rounded-lg transition text-sm flex items-center space-x-2 font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700/50 dark:hover:bg-slate-700">
                                 <TrashIcon className="h-4 w-4" />
                                 <span>Eliminar</span>
                            </button>
                            </>
                           )}
                        </div>
                    </div>
                </div>
                 {status && status.type === 'bar' && isExpanded && (
                    <div className={`px-4 py-2 ${status.barClass}`}>
                        <div className={`flex items-center space-x-1.5 text-sm ${status.textClass}`}>
                            <status.Icon className={`h-5 w-5 ${status.iconColor}`} />
                            <span>{status.text}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </>
    );
};

export default TripCard;