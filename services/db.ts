import { storage } from '../firebase';
import { ref, uploadBytes, getBlob, deleteObject, getMetadata } from 'firebase/storage';
import type { FirebaseError } from 'firebase/app';
import type { BoardingPassFile } from '../types';

// La inicialización de la base de datos ya no es necesaria, Firebase se encarga de ello.

const getFileRef = (userId: string, tripId: string, flightType: 'ida' | 'vuelta') => {
    return ref(storage, `boarding-passes/${userId}/${tripId}-${flightType}`);
};

export const saveBoardingPass = async (userId: string, tripId: string, flightType: 'ida' | 'vuelta', file: File): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    const fileRef = getFileRef(userId, tripId, flightType);
    await uploadBytes(fileRef, file);
};

export const getBoardingPass = async (userId: string, tripId: string, flightType: 'ida' | 'vuelta'): Promise<File | null> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    try {
        const fileRef = getFileRef(userId, tripId, flightType);
        const blob = await getBlob(fileRef);
        // Firebase `getBlob` devuelve un Blob. Un Blob se puede usar como un File para URL.createObjectURL.
        // Hacemos un cast para mantener la compatibilidad con el tipo existente.
        return blob as File;
    } catch (error) {
        const firebaseError = error as FirebaseError;
        if (firebaseError.code === 'storage/object-not-found') {
            console.log('La tarjeta de embarque no se encontró en Storage.');
            return null;
        }
        console.error('Error al obtener la tarjeta de embarque de Firebase Storage:', error);
        throw error;
    }
};

export const checkBoardingPassExists = async (userId: string, tripId: string, flightType: 'ida' | 'vuelta'): Promise<boolean> => {
    if (!userId) return false;
    const fileRef = getFileRef(userId, tripId, flightType);
    try {
        await getMetadata(fileRef);
        return true;
    } catch (error) {
        const firebaseError = error as FirebaseError;
        if (firebaseError.code === 'storage/object-not-found') {
            return false;
        }
        console.error('Error al verificar la existencia de la tarjeta de embarque:', error);
        throw error; // Relanzar otros errores
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
