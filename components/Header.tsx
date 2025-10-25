import React from 'react';
import { SunIcon } from './icons/SunIcon';
import { MoonIcon } from './icons/MoonIcon';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme }) => {
  return (
    <header className="flex justify-between items-center mb-8 py-2">
      <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight [text-shadow:0_2px_5px_rgba(0,0,0,0.4)]">
        VueLuc 2.0
      </h1>
      <div className="flex items-center space-x-1 sm:space-x-2">
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
          aria-label="Cambiar tema"
        >
          {theme === 'light' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
        </button>
      </div>
    </header>
  );
};

export default Header;