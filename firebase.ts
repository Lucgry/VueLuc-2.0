// src/firebase.ts
import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCDATMtZNX786iBxSvWkIRGxowpF-GNN_I",
  authDomain: "vueluc-app.firebaseapp.com",
  projectId: "vueluc-app",
  storageBucket: "vueluc-app.firebasestorage.app",
  messagingSenderId: "463918423785",
  appId: "1:463918423785:web:80bb4c924bdcf4b37e5a78",
};

const hasAllConfigValues = Object.values(firebaseConfig).every(Boolean);

// ─────────────────────────────────────────────
// Exported references (NON-null types)
// ─────────────────────────────────────────────
let app!: FirebaseApp;
let auth!: Auth;
let db!: Firestore;
let storage!: FirebaseStorage;
let googleProvider!: GoogleAuthProvider;

let isFirebaseInitialized = false;
let firebaseInitializationError:
  | { message: string; links?: { url: string; text: string }[] }
  | null = null;

const projectId = firebaseConfig.projectId;
const authDomain = firebaseConfig.authDomain;

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────
if (!hasAllConfigValues) {
  firebaseInitializationError = {
    message:
      "La configuración de Firebase en 'firebase.ts' está incompleta. Faltan uno o más valores.",
  };
  console.warn(firebaseInitializationError.message);
} else {
  try {
    app = initializeApp(firebaseConfig);

    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    googleProvider = new GoogleAuthProvider();

    isFirebaseInitialized = true;
  } catch (error: any) {
    console.error(
      "Error al inicializar Firebase. Verifica tu configuración.",
      error
    );

    isFirebaseInitialized = false;

    const errorMessage =
      error?.message || "Error desconocido al inicializar Firebase.";

    if (errorMessage.includes("auth has not been registered")) {
      firebaseInitializationError = {
        message:
          "Este error usualmente significa que la Autenticación (o el proveedor de Google) no está habilitada o no se guardó el cambio en tu proyecto de Firebase. Ve a Firebase Console > Authentication > Sign-in method y habilita Google. Asegúrate de GUARDAR los cambios.",
        links: [
          {
            url: `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`,
            text: "Ir a la consola de Firebase",
          },
        ],
      };
    } else {
      firebaseInitializationError = { message: errorMessage };
    }
  }
}

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────
export {
  auth,
  db,
  storage,
  googleProvider,
  isFirebaseInitialized,
  firebaseInitializationError,
  projectId,
  authDomain,
};
