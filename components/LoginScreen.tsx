import React, { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { GoogleIcon } from './icons/GoogleIcon';
import { BoltIcon } from './icons/BoltIcon';

const LoginScreen: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      if (!auth || !googleProvider) {
        throw new Error("La configuración de Firebase no se cargó correctamente.");
      }
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Error detallado de inicio de sesión:", err);
      const errorMessage = err.message || '';
      const errorCode = err.code || '';

      const startMarker = 'requests-from-referer-https://';
      const endMarker = '-are-blocked';
      
      if (errorCode === 'auth/unauthorized-domain' || errorMessage.includes(startMarker)) {
        let domainToAuthorize = '';
        const startIndex = errorMessage.indexOf(startMarker);
        const endIndex = errorMessage.indexOf(endMarker);

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const startPos = startIndex + startMarker.length;
            domainToAuthorize = errorMessage.substring(startPos, endIndex);
        }
        
        if (domainToAuthorize) {
            setError(`El dominio no está autorizado. Por favor, agrega el siguiente dominio a la lista de "Dominios autorizados" en tu configuración de Firebase Authentication y vuelve a intentarlo: ${domainToAuthorize}`);
        } else {
            // Fallback en caso de que el mensaje de error cambie de formato
            setError('El dominio de esta aplicación no está autorizado. Revisa la consola de desarrollo para identificar el dominio exacto y agrégalo a la lista de "Dominios autorizados" en tu configuración de Firebase Authentication.');
        }

      } else if (errorCode === 'auth/popup-closed-by-user') {
          setError('Cancelaste el inicio de sesión.');
      } else {
          setError("No se pudo iniciar sesión. Revisa la consola para ver el error detallado.");
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <div className="max-w-xl w-full bg-slate-100 dark:bg-slate-800 p-8 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out">
        <div className="mx-auto mb-4 bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 w-16 h-16 rounded-full flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out">
            <BoltIcon className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Bienvenido a VueLuc 2.0</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Inicia sesión para sincronizar tus viajes de forma segura en la nube.
        </p>

        {error && (
            <div className="mt-6 p-3 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 rounded-lg text-sm text-left shadow-neumo-light-in dark:shadow-neumo-dark-in">
                <p className="font-semibold">Error de inicio de sesión</p>
                <p className="mt-1 break-words">{error}</p>
            </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          className="mt-8 w-full px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-md transition-shadow duration-200 flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in"
        >
          <GoogleIcon className="h-6 w-6 mr-3" />
          Iniciar sesión con Google
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;