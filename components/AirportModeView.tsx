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

const AirportModeView: React.FC<AirportModeViewProps> = ({ trip, flight, flightType, onClose }) => {
    const [boardingPassData, setBoardingPassData] = useState<BoardingPassData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isViewerOpen, setIsViewerOpen] = useState(false);

    useEffect(() => {
        const fetchBoardingPass = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const file = await getBoardingPass(trip.id, flightType);
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

    }, [trip.id, flightType]);

    return (
        <>
            {isViewerOpen && boardingPassData && (
                <BoardingPassViewer
                    fileURL={boardingPassData.fileURL}
                    fileType={boardingPassData.fileType}
                    onClose={() => setIsViewerOpen(false)}
                />
            )}
            <div className="fixed inset-0 bg-slate-100 dark:bg-slate-900 z-50 p-4 flex flex-col">
                <header className="flex justify-between items-center pb-4 border-b border-slate-300 dark:border-slate-700">
                    <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Modo Aeropuerto</h1>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300">
                        <XCircleIcon className="w-8 h-8"/>
                    </button>
                </header>

                <main className="flex-grow flex flex-col justify-between pt-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-4 border border-slate-200 dark:border-slate-700">
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
                        <div className="text-center bg-slate-100 dark:bg-slate-700/50 rounded-lg p-2">
                             <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 capitalize">{formatDate(flight.departureDateTime)}</p>
                             <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{formatTime(flight.departureDateTime)} hs</p>
                        </div>
                    </div>

                    <div className="flex-grow flex flex-col items-center justify-center text-center my-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
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
                            <div className="w-full h-full flex flex-col justify-center items-center cursor-pointer" onClick={() => setIsViewerOpen(true)}>
                                <p className="font-semibold mb-2">Toca para ver en pantalla completa</p>
                                <img 
                                    src={boardingPassData.fileURL} 
                                    alt="Vista previa de la tarjeta de embarque" 
                                    className="max-h-64 w-auto object-contain rounded-md shadow-lg"
                                />
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
};

export default AirportModeView;