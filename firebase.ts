import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Configuración de Firebase con los valores proporcionados por el usuario.
// Con esto la app se conectará correctamente.
const firebaseConfig = {
  apiKey: "AIzaSyCDATMtZNX786iBxSvWkIRGxowpF-GNN_I",
  authDomain: "vueluc-app.firebaseapp.com",
  projectId: "vueluc-app",
  storageBucket: "vueluc-app.appspot.com",
  messagingSenderId: "463918423785",
  appId: "1:463918423785:web:80bb4c924bdcf4b37e5a78"
};

const hasAllConfigValues = Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let isFirebaseInitialized = false;
let firebaseInitializationError: { message: string; link?: { url: string; text: string; }; } | null = null;

if (hasAllConfigValues) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        googleProvider = new GoogleAuthProvider();
        isFirebaseInitialized = true;
    } catch (error: any) {
        console.error("Error al inicializar Firebase. Verifica tu configuración.", error);
        isFirebaseInitialized = false;
        const errorMessage = error.message || 'Error desconocido al inicializar.';
        if (errorMessage.includes('auth has not been registered')) {
            firebaseInitializationError = {
                message: `Este error usualmente significa que la Autenticación (o el proveedor de Google) no está habilitada o no se guardó el cambio en tu proyecto de Firebase. Por favor, ve a la Consola de Firebase > Authentication > Sign-in method, y habilita el proveedor de Google. Es MUY IMPORTANTE que hagas clic en 'Guardar'. Si el botón 'Guardar' está deshabilitado, apaga y vuelve a encender el interruptor para activarlo.`,
                link: {
                    url: `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`,
                    text: 'Ir a la consola de Firebase'
                }
            };
        } else {
            firebaseInitializationError = { message: errorMessage };
        }
    }
} else {
    isFirebaseInitialized = false;
    firebaseInitializationError = { message: "La configuración de Firebase en 'firebase.ts' está incompleta. Faltan uno o más valores." };
    console.warn(firebaseInitializationError.message);
}

export { auth, db, storage, googleProvider, isFirebaseInitialized, firebaseInitializationError };