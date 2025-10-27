import type { BoardingPassFile } from '../types';

const DB_NAME = 'VueLucDB';
const DB_VERSION = 1;
const STORE_NAME = 'boarding_passes';

let db: IDBDatabase;

export const initDB = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(true);
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(true);
    };

    request.onerror = (event) => {
      console.error('Error en la base de datos:', (event.target as IDBOpenDBRequest).error);
      reject(false);
    };
  });
};

/**
 * Realiza una transacción de escritura/eliminación en IndexedDB de forma robusta,
 * envolviendo la transacción completa en una promesa.
 */
const performTransaction = (
  action: (store: IDBObjectStore) => void
): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    if (!db) {
      try {
        await initDB();
      } catch (e) {
        return reject(e);
      }
    }

    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    try {
      action(store);
    } catch (error) {
      return reject(error);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      console.error('Error en la transacción de DB:', transaction.error);
      reject(transaction.error);
    };
    
    transaction.onabort = () => {
        console.error('Transacción de DB abortada:', transaction.error);
        reject(transaction.error);
    }
  });
};


export const saveBoardingPass = (tripId: string, flightType: 'ida' | 'vuelta', file: File): Promise<void> => {
  return performTransaction((store) => {
    const data: BoardingPassFile = {
      id: `${tripId}-${flightType}`,
      tripId,
      flightType,
      file,
    };
    store.put(data);
  });
};

export const getBoardingPass = (tripId: string, flightType: 'ida' | 'vuelta'): Promise<File | null> => {
    return new Promise(async (resolve, reject) => {
        if (!db) {
            try {
                await initDB();
            } catch (e) {
                return reject(e);
            }
        }
        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`${tripId}-${flightType}`);

            let resultData: File | null = null;

            request.onsuccess = (event) => {
                const result = (event.target as IDBRequest<BoardingPassFile>).result;
                resultData = result ? result.file : null;
            };

            // CRÍTICO: Esperar a que la transacción completa termine antes de resolver.
            // Esto evita que una transacción de lectura bloquee una de escritura posterior.
            transaction.oncomplete = () => {
                resolve(resultData);
            };

            // Manejar errores tanto en la petición como en la transacción para mayor robustez.
            request.onerror = (event) => {
                console.error('Error al obtener la tarjeta de embarque (request):', (event.target as IDBRequest).error);
                reject((event.target as IDBRequest).error);
            };
            transaction.onerror = (event) => {
                console.error('Error al obtener la tarjeta de embarque (transaction):', transaction.error);
                reject(transaction.error);
            };
        } catch (error) {
            console.error('Error creando la transacción de solo lectura para getBoardingPass:', error);
            reject(error);
        }
    });
};

export const checkBoardingPassExists = (tripId: string, flightType: 'ida' | 'vuelta'): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
        if (!db) {
            try {
                await initDB();
            } catch (e) {
                return reject(e);
            }
        }
        try {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`${tripId}-${flightType}`);

            let exists = false;

            request.onsuccess = (event) => {
                exists = !!(event.target as IDBRequest<BoardingPassFile>).result;
            };

            transaction.oncomplete = () => {
                resolve(exists);
            };

            request.onerror = (event) => {
                reject((event.target as IDBRequest).error);
            };
            transaction.onerror = (event) => {
                reject(transaction.error);
            };
        } catch (error) {
            console.error('Error creando la transacción de solo lectura para checkBoardingPassExists:', error);
            reject(error);
        }
    });
};


export const deleteBoardingPass = (tripId: string, flightType: 'ida' | 'vuelta'): Promise<void> => {
  return performTransaction((store) => {
    store.delete(`${tripId}-${flightType}`);
  });
};


export const deleteBoardingPassesForTrip = (tripId: string): Promise<void> => {
    return performTransaction((store) => {
        store.delete(`${tripId}-ida`);
        store.delete(`${tripId}-vuelta`);
    });
};