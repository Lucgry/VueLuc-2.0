import React, { useMemo } from 'react';
import { DevicePhoneMobileIcon } from './icons/DevicePhoneMobileIcon';
import { ComputerDesktopIcon } from './icons/ComputerDesktopIcon';
import { ShareIcon } from './icons/ShareIcon';
import { EllipsisVerticalIcon } from './icons/EllipsisVerticalIcon';
import { ArrowDownTrayIcon } from './icons/ArrowDownTrayIcon';

interface InstallHelpModalProps {
    onClose: () => void;
}

type Platform = 'iOS' | 'Android' | 'Desktop';

const InstallHelpModal: React.FC<InstallHelpModalProps> = ({ onClose }) => {

    const platform = useMemo((): Platform => {
        const userAgent = navigator.userAgent;
        
        // La detección para iPads más nuevos requiere una comprobación adicional,
        // ya que pueden reportar un userAgent de macOS.
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) return 'iOS';
        if (/android/i.test(userAgent)) return 'Android';
        
        return 'Desktop';
    }, []);

    const instructions = {
        Android: {
            icon: <DevicePhoneMobileIcon className="h-8 w-8 mx-auto" />,
            title: "Instalar en Android",
            steps: [
                { text: "Abre el menú del navegador.", icon: <EllipsisVerticalIcon className="h-6 w-6" /> },
                { text: "Toca en 'Instalar aplicación'.", icon: <ArrowDownTrayIcon className="h-6 w-6" /> },
                { text: "Confirma la acción.", icon: <div className="font-bold text-xs">OK</div> }
            ]
        },
        iOS: {
            icon: <DevicePhoneMobileIcon className="h-8 w-8 mx-auto" />,
            title: "Instalar en iPhone/iPad",
            steps: [
                { text: "Toca el botón de Compartir.", icon: <ShareIcon className="h-6 w-6" /> },
                { text: "Busca 'Agregar a la pantalla de inicio'.", icon: <ArrowDownTrayIcon className="h-6 w-6" /> },
                { text: "Confirma para agregar.", icon: <div className="font-bold text-xs">OK</div> }
            ]
        },
        Desktop: {
            icon: <ComputerDesktopIcon className="h-8 w-8 mx-auto" />,
            title: "Instalar en tu Computadora",
            steps: [
                { text: "Busca este ícono en la barra de direcciones.", icon: <ArrowDownTrayIcon className="h-6 w-6" /> },
                { text: "Haz clic en él.", icon: <div className="w-6 h-6" /> },
                { text: "Selecciona 'Instalar' para confirmar.", icon: <div className="font-bold text-xs">OK</div> }
            ]
        }
    };

    const currentInstructions = instructions[platform];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-md transform transition-all text-center" onClick={e => e.stopPropagation()}>

                <div className="mx-auto mb-4 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-16 h-16 rounded-full flex items-center justify-center">
                    {currentInstructions.icon}
                </div>

                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">{currentInstructions.title}</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">Sigue estos pasos para una mejor experiencia.</p>

                <ol className="space-y-4 text-left">
                    {currentInstructions.steps.map((step, index) => (
                        <li key={index} className="flex items-center space-x-4">
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-full font-bold">
                                {index + 1}
                            </div>
                            <span className="flex-1 text-slate-700 dark:text-slate-300">{step.text}</span>
                             <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                {step.icon}
                            </div>
                        </li>
                    ))}
                </ol>

                <button
                    onClick={onClose}
                    className="mt-8 w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition"
                >
                    Entendido
                </button>
            </div>
        </div>
    );
};

export default InstallHelpModal;