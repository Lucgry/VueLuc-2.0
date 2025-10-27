import React, { useState } from 'react';
import { BoltIcon } from './icons/BoltIcon';
import { InformationCircleIcon } from './icons/InformationCircleIcon';

interface ApiKeySetupProps {
  onKeySave: (key: string) => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onKeySave }) => {
  const [apiKey, setApiKey] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
        onKeySave(apiKey.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <div className="max-w-xl w-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-8 rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80">
        <div className="mx-auto mb-4 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-16 h-16 rounded-full flex items-center justify-center">
            <BoltIcon className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Conecta con la IA de Google</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Para usar las funciones inteligentes, necesitas una API Key gratuita de Google AI Studio.
        </p>
        
        <div className="mt-6 text-left bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-3 text-center">Sigue estos 5 pasos:</h3>
            <ol className="space-y-3">
                <li className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500 text-white rounded-full font-bold text-sm">1</div>
                    <div className="flex-grow">
                        <p className="text-slate-700 dark:text-slate-300">
                            Abre Google AI Studio y selecciona tu proyecto. Si no tienes uno, créalo.
                        </p>
                         <a 
                          href="https://aistudio.google.com/app/projects"
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mt-2 inline-block px-4 py-2 bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition shadow-sm text-sm"
                        >
                          Ir a Google AI Studio
                        </a>
                    </div>
                </li>
                <li className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500 text-white rounded-full font-bold text-sm">2</div>
                    <p className="text-slate-700 dark:text-slate-300 flex-grow">
                        En el menú de la izquierda, busca la opción <strong>"Obtener clave de API"</strong> y haz clic.
                    </p>
                </li>
                <li className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500 text-white rounded-full font-bold text-sm">3</div>
                     <p className="text-slate-700 dark:text-slate-300 flex-grow">
                        Haz clic en <strong>"Crear clave de API"</strong>. Necesitarás un proyecto de Google Cloud con la facturación habilitada.
                    </p>
                </li>
                 <li className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500 text-white rounded-full font-bold text-sm">4</div>
                    <p className="text-slate-700 dark:text-slate-300 flex-grow">
                        <strong>Paso clave:</strong> Si después de crear la clave ves un enlace azul que dice <strong>"Configurar la facturación"</strong>, haz clic en él. Es un paso obligatorio para que la clave funcione.
                    </p>
                </li>
                <li className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500 text-white rounded-full font-bold text-sm">5</div>
                    <p className="text-slate-700 dark:text-slate-300 flex-grow">
                        Una vez activada la facturación, tu clave estará lista. Cópiala y pégala en el campo de abajo.
                    </p>
                </li>
            </ol>
        </div>
        
        <div className="mt-6 p-4 rounded-lg bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-left flex items-start space-x-3">
             <div className="flex-shrink-0 mt-0.5">
                <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">Importante: Sobre los costos y el nivel gratuito</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Google te pedirá configurar la facturación, pero el modelo de IA que usamos tiene un **nivel gratuito muy generoso**. Para el uso de esta app (viajes semanales), es muy poco probable que generes costos.
                    <a href="https://ai.google.dev/pricing" target="_blank" rel="noopener noreferrer" className="font-bold underline ml-1">Ver precios oficiales</a>.
                </p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Pega tu API Key aquí"
            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            required
          />
          <button
            type="submit"
            className="mt-4 w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition flex items-center justify-center shadow-lg disabled:opacity-50"
            disabled={!apiKey.trim()}
          >
            Guardar y Continuar
          </button>
        </form>
         <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Tu clave se guarda localmente en tu navegador y no se comparte.
        </p>
      </div>
    </div>
  );
};

export default ApiKeySetup;