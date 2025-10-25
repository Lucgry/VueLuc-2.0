import React from 'react';
import { ArrowDownTrayIcon } from './icons/ArrowDownTrayIcon';
import { XCircleIcon } from './icons/XCircleIcon';

interface InstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

const InstallBanner: React.FC<InstallBannerProps> = ({ onInstall, onDismiss }) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between z-50 animate-pulse-glow">
      <div className="flex items-center space-x-4">
        <div className="bg-white/20 p-2 rounded-full hidden sm:block">
            <ArrowDownTrayIcon className="h-6 w-6"/>
        </div>
        <div>
            <h3 className="font-bold">Instala VueLuc 2.0</h3>
            <p className="text-sm text-indigo-200">Acceso rápido y uso sin conexión.</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onInstall}
          className="px-4 py-2 bg-white text-indigo-600 font-bold rounded-lg text-sm hover:bg-indigo-100 transition"
        >
          Instalar
        </button>
        <button onClick={onDismiss} className="p-2 text-indigo-200 hover:text-white transition rounded-full">
            <XCircleIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};

export default InstallBanner;
