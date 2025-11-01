import React, { useState } from 'react';
import { auth, googleProvider, projectId } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { GoogleIcon } from './icons/GoogleIcon';
import { BoltIcon } from './icons/BoltIcon';
import { InformationCircleIcon } from './icons/InformationCircleIcon';

const LoginScreen: React.FC = () => {
  const [error, setError] = useState<{ message: string; link?: { url: string; text: string; } } | null>(null);

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

      if (errorMessage.includes('API_KEY_HTTP_REFERRER_BLOCKED') || errorMessage.includes('requests-from-referer')) {
          setError({
              message: "Tu clave de API de Google Cloud está bloqueando las solicitudes de este sitio web. Para solucionarlo, debes autorizar este dominio en la configuración de tu clave de API.",
              link: {
                  url: `https://console.cloud.google.com/apis/credentials?project=${projectId}`,
                  text: 'Abrir configuración de credenciales'
              }
          });
      } else if (errorCode === 'auth/unauthorized-domain') {
        setError({
            message: `El dominio de esta aplicación no está autorizado para el inicio de sesión. Por favor, ve a la configuración de Autenticación de Firebase y agrega "${window.location.hostname}" a la lista de dominios autorizados.`
        });
      } else if (errorCode === 'auth/popup-closed-by-user') {
          // No es un error crítico, no mostramos nada.
      } else {
          setError({ message: "No se pudo iniciar sesión. Revisa la consola para ver el error detallado y asegúrate de que tu configuración de Firebase es correcta."});
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
            <div className="mt-6 p-4 rounded-lg bg-red-100/50 dark:bg-red-900/20 text-left flex items-start space-x-3 shadow-neumo-light-in dark:shadow-neumo-dark-in">
                <div className="flex-shrink-0 mt-0.5">
                    <InformationCircleIcon className="w-5 h-5 text-red-600 dark:text-red-300" />
                </div>
                <div>
                    <h4 className="font-semibold text-red-800 dark:text-red-200">Acción Requerida:</h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1 whitespace-pre-wrap">
                        {error.message}
                    </p>
                    {error.link && (
                       <div className="mt-4">
                           <a 
                                href={error.link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-semibold rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in text-sm text-center"
                            >
                                {error.link.text} &rarr;
                            </a>
                           <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                En "Restricciones de sitios web", haz clic en "Añadir" y pega esta URL: <br/>
                                <strong className="select-all break-all">{window.location.origin}</strong>
                           </p>
                       </div>
                    )}
                </div>
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