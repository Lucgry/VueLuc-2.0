import React from 'react';

export const Spinner: React.FC = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
);

export const FullScreenLoader: React.FC = () => (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500"></div>
        <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando...</p>
    </div>
);
