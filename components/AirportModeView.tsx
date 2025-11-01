import React, { useState, useEffect } from 'react';
import type { Trip, Flight, BoardingPassData } from '../types';
import { getBoardingPass } from '../services/db';
import { AirlineLogo } from './AirlineLogo';
import BoardingPassViewer from './BoardingPassViewer';
import { Spinner } from './Spinner';
import { XCircleIcon } from './icons/XCircleIcon';
import { DocumentPlusIcon } from './icons/DocumentPlusIcon';

interface AirportModeViewProps {
  trip: Trip;
  flight: Flight;
  flightType: 'ida' | 'vuelta';
  onClose: () => void;
  userId: string;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const AirportModeView: React.FC<AirportModeViewProps> = ({ trip, flight, flightType, onClose, userId }) => {
    const [boardingPassData, setBoardingPassData] = useState<BoardingPassData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isViewerOpen, setIsViewerOpen] = useState(false);

    useEffect(() => {
        const fetchBoardingPass = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // FIX: Pass userId as the first argument to getBoardingPass.
                const file = await getBoardingPass(userId, trip.id, flightType);
                if (file) {
                    const url = URL.createObjectURL(file);
                    setBoardingPassData({ fileURL: url, fileType: file.type });
                } else {
                    setError('No se encontró la tarjeta de embarque para este vuelo.');
                }
            } catch (err) {
                console.error(err);
                setError('Error al cargar la tarjeta de embarque.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchBoardingPass();
        
        // Cleanup blob URL on component unmount
        return () => {
            if (boardingPassData?.fileURL.startsWith('blob:')) {
                URL.revokeObjectURL(boardingPassData.fileURL);
            }
        };

    }, [userId, trip.id, flightType]);

    return (
        <>
            {isViewerOpen && boardingPassData && (
                <BoardingPassViewer
                    fileURL={boardingPassData.fileURL}
                    fileType={boardingPassData.fileType}
                    onClose={() => setIsViewerOpen(false)}
                />
            )}
            <div className="fixed inset-0 bg-slate-100 dark:bg-slate-800 z-50 p-4 flex flex-col">
                <header className="flex justify-between items-center pb-4 flex-shrink-0">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Modo Aeropuerto</h1>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 p-2 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow duration-200"
                    >
                        <XCircleIcon className="w-8 h-8"/>
                    </button>
                </header>

                <main className="flex-grow flex flex-col pt-4 space-y-4 overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out p-4 flex-shrink-0">
                         <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{flight.airline}</p>
                                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{flight.flightNumber}</p>
                            </div>
                            <AirlineLogo airline={flight.airline} size="sm" />
                        </div>
                        <div className="text-center my-4">
                            <p className="text-4xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                                {flight.departureCity} &rarr; {flight.arrivalCity}
                            </p>
                        </div>
                        <div className="text-center rounded-lg p-2 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                             <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 capitalize">{formatDate(flight.departureDateTime)}</p>
                             <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{formatTime(flight.departureDateTime)} hs</p>
                        </div>
                    </div>

                    <div className="flex-grow flex flex-col items-center justify-center text-center p-4 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
                        {isLoading && <Spinner />}
                        {error && !isLoading && (
                            <div className="text-red-500">
                                <DocumentPlusIcon className="w-16 h-16 mx-auto mb-2 text-red-400"/>
                                <p className="font-bold">Tarjeta de Embarque Faltante</p>
                                <p className="text-sm">{error}</p>
                                <p className="text-sm mt-2">Por favor, agrégala desde la vista principal del viaje.</p>
                            </div>
                        )}
                        {boardingPassData && !isLoading && (
                            <button
                                type="button"
                                className="w-full h-full flex flex-col justify-center items-center cursor-pointer group focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 rounded-lg p-2 active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in transition-shadow duration-200"
                                onClick={() => setIsViewerOpen(true)}
                                aria-label="Ver tarjeta de embarque en pantalla completa"
                            >
                                <p className="font-semibold mb-2 text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Toca para ver en pantalla completa</p>
                                <img 
                                    src={boardingPassData.fileURL} 
                                    alt="Vista previa de la tarjeta de embarque" 
                                    className="max-h-64 w-auto object-contain rounded-md shadow-lg group-hover:shadow-xl transition-shadow"
                                />
                            </button>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
};

export default AirportModeView;
