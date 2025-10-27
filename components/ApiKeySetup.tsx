import React, { useState } from 'react';
import { BoltIcon } from './icons/BoltIcon';

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
      <div className="max-w-md w-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-8 rounded-lg shadow-md border border-slate-200/80 dark:border-slate-700/80">
        <div className="mx-auto mb-4 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-16 h-16 rounded-full flex items-center justify-center">
            <BoltIcon className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Configuración Requerida</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Para usar las funciones de IA, necesitas una API Key de Google AI.
        </p>
        
        <a 
          href="https://aistudio.google.com/app/apikey" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-4 inline-block w-full px-6 py-3 bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition shadow-sm"
        >
          Obtener mi API Key en Google AI Studio
        </a>
        
        <form onSubmit={handleSubmit} className="mt-4">
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
          Tu clave se guarda localmente en tu navegador y no se comparte. El uso de la API puede generar costos en tu cuenta de Google.
        </p>
      </div>
    </div>
  );
};

export default ApiKeySetup;
