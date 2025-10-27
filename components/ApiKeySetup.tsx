import React from 'react';
import { BoltIcon } from './icons/BoltIcon';

interface ApiKeySetupProps {
  onSelectKey: () => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onSelectKey }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <div className="max-w-md w-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-8 rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80">
        <div className="mx-auto mb-4 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-16 h-16 rounded-full flex items-center justify-center">
            <BoltIcon className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Bienvenido a VueLuc 2.0</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Para utilizar las funciones de inteligencia artificial para importar viajes, es necesario configurar una API key de Google.
        </p>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Esta acción puede generar costos en tu cuenta de Google Cloud. Para más información, consulta la 
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline"> documentación de facturación</a>.
        </p>
        <button
          onClick={onSelectKey}
          className="mt-6 w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition flex items-center justify-center shadow-lg"
        >
          Configurar API Key
        </button>
      </div>
    </div>
  );
};

export default ApiKeySetup;
