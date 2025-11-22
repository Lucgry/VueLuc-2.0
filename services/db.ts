import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
import type { FirebaseError } from 'firebase/app';

// La inicialización de la base de datos ya no es necesaria, Firebase se encarga de ello.

const getFileRef = (userId: string, tripId: string, flightType: 'ida' | 'vuelta') => {
    if (!storage) throw new Error("Firebase Storage no está inicializado.");
    return ref(storage, `boarding-passes/${userId}/${tripId}-${flightType}`);
};

export const saveBoardingPass = async (userId: string, tripId: string, flightType: 'ida' | 'vuelta', file: File): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    const fileRef = getFileRef(userId, tripId, flightType);
    await uploadBytes(fileRef, file);
};

export const getBoardingPass = async (userId: string, tripId: string, flightType: 'ida' | 'vuelta'): Promise<{ file: File; exists: true } | { file: null; exists: false }> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    try {
        const fileRef = getFileRef(userId, tripId, flightType);
        
        // Obtener una URL de descarga. Esto también sirve como una verificación de existencia.
        // Si falla con 'storage/object-not-found', sabemos que el archivo no existe.
        const downloadUrl = await getDownloadURL(fileRef);
        
        // Usar `fetch` para descargar el archivo para evitar problemas complejos de CORS.
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Error al descargar el archivo: ${response.statusText}`);
        }
        const blob = await response.blob();
        
        return { file: blob as File, exists: true };

    } catch (error) {
        const firebaseError = error as FirebaseError;
        if (firebaseError.code === 'storage/object-not-found') {
            console.log('La tarjeta de embarque no se encontró en Storage.');
            return { file: null, exists: false };
        }
        console.error('Error al obtener la tarjeta de embarque de Firebase Storage:', error);
        throw error;
    }
};


export const deleteBoardingPass = async (userId: string, tripId: string, flightType: 'ida' | 'vuelta'): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    const fileRef = getFileRef(userId, tripId, flightType);
    try {
        await deleteObject(fileRef);
    } catch (error) {
        const firebaseError = error as FirebaseError;
        // Si el archivo no se encuentra, ya está "eliminado", así que ignoramos el error.
        if (firebaseError.code !== 'storage/object-not-found') {
             console.error('Error al eliminar la tarjeta de embarque de Firebase Storage:', error);
             throw error;
        }
    }
};

export const deleteBoardingPassesForTrip = async (userId: string, tripId: string): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    // Eliminamos ambas tarjetas de embarque (ida y vuelta) para el viaje.
    await Promise.all([
        deleteBoardingPass(userId, tripId, 'ida'),
        deleteBoardingPass(userId, tripId, 'vuelta'),
    ]).catch(error => {
        // Aunque una falle, intentamos ambas. Logueamos el error pero no bloqueamos la eliminación del viaje.
        console.error("Error eliminando una de las tarjetas de embarque:", error);
    });
};