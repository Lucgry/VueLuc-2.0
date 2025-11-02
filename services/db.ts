import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import type { FirebaseError } from 'firebase/app';

const getFileRef = (userId: string, legId: string) => {
    // La ruta ahora es más simple, solo necesita el ID del tramo.
    return ref(storage, `boarding-passes/${userId}/${legId}`);
};

export const saveBoardingPass = async (userId: string, legId: string, file: File): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    const fileRef = getFileRef(userId, legId);
    await uploadBytes(fileRef, file);
};

export const getBoardingPass = async (userId: string, legId: string): Promise<{ file: File; exists: true } | { file: null; exists: false }> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    try {
        const fileRef = getFileRef(userId, legId);
        
        const downloadUrl = await getDownloadURL(fileRef);
        
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Error al descargar el archivo: ${response.statusText}`);
        }
        const blob = await response.blob();
        
        return { file: blob as File, exists: true };

    } catch (error) {
        const firebaseError = error as FirebaseError;
        if (firebaseError.code === 'storage/object-not-found') {
            return { file: null, exists: false };
        }
        console.error('Error al obtener la tarjeta de embarque de Firebase Storage:', error);
        throw error;
    }
};

export const deleteBoardingPass = async (userId: string, legId: string): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    const fileRef = getFileRef(userId, legId);
    try {
        await deleteObject(fileRef);
    } catch (error) {
        const firebaseError = error as FirebaseError;
        if (firebaseError.code !== 'storage/object-not-found') {
             console.error('Error al eliminar la tarjeta de embarque de Firebase Storage:', error);
             throw error;
        }
    }
};

export const deleteBoardingPassesForLegs = async (userId: string, legIds: string[]): Promise<void> => {
    if (!userId) throw new Error("Usuario no autenticado.");
    const deletionPromises = legIds.map(legId => deleteBoardingPass(userId, legId));
    await Promise.all(deletionPromises).catch(error => {
        console.error("Error eliminando una de las tarjetas de embarque durante la eliminación del viaje:", error);
    });
};