import React from 'react';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';
import { PlaneIcon } from './icons/PlaneIcon';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isAirportMode: boolean;
  onToggleAirportMode: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme, isAirportMode, onToggleAirportMode }) => {
    
  return (
    <header className="flex justify-between items-center mb-8 py-2">
       <div className="flex items-center space-x-2 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-1 rounded-full border border-slate-200/80 dark:border-slate-700/80">
        <button
          onClick={onToggleAirportMode}
          role="switch"
          aria-checked={isAirportMode}
          className={`relative inline-flex items-center h-8 w-14 rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${isAirportMode ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ease-in-out ${isAirportMode ? 'translate-x-7' : 'translate-x-1'}`}
          />
          <PlaneIcon className={`absolute h-4 w-4 transition-colors duration-300 ease-in-out ${isAirportMode ? 'left-2 text-white' : 'right-2 text-slate-500'}`} />
        </button>
         <button
          onClick={onToggleTheme}
          className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
          aria-label="Cambiar tema"
        >
          {theme === 'light' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </button>
      </div>
      <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight [text-shadow:0_2px_5px_rgba(0,0,0,0.4)]">
        VueLuc 2.0
      </h1>
    </header>
  );
};

export default Header;