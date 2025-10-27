import React, { useState } from 'react';
import type { Trip } from '../types';
import { parseFlightEmail } from '../services/geminiService';
import { Spinner } from './Spinner';
import { MailIcon } from './icons/MailIcon';

interface EmailImporterProps {
  onClose: () => void;
  onAddTrip: (newTrip: Omit<Trip, 'id' | 'createdAt'>) => void;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

const EmailImporter: React.FC<EmailImporterProps> = ({ onClose, onAddTrip }) => {
  const [emailText, setEmailText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!emailText.trim()) {
      setError('Por favor, pega el contenido del correo.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      let pdfBase64: string | null = null;
      if (pdfFile) {
        pdfBase64 = await fileToBase64(pdfFile);
      }
      const newTrip = await parseFlightEmail(emailText, pdfBase64);
      onAddTrip(newTrip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setIsLoading(false);
    }
  };
  
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setPdfFile(event.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-6 md:p-8 w-full max-w-2xl transform transition-all" onClick={e => e.stopPropagation()}>
        
        <div className="flex justify-between items-start mb-4">
            <div className="flex items-start sm:items-center space-x-4">
                <div className="bg-indigo-100 dark:bg-indigo-500/20 p-3 rounded-full mt-1 sm:mt-0">
                    <MailIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Agregar Viaje con IA</h2>
                     <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Pega el email de confirmación y adjunta el PDF del costo.</p>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 text-3xl leading-none">&times;</button>
        </div>
        
        <div className="space-y-2 text-slate-700 dark:text-slate-300 text-sm mb-4 bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg">
            <p><b>Tip:</b> Para asegurar una importación perfecta, reenvía el email de la aerolínea a tu propia cuenta, luego copia y pega el contenido de ese email reenviado.</p>
        </div>

        <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="Pega aquí el contenido completo del email..."
            className="w-full h-48 p-3 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            disabled={isLoading}
        />
        
        <div className="mt-4">
            <label htmlFor="pdf-upload-main" className="cursor-pointer text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900 px-3 py-2 rounded-md transition">
            <span>{pdfFile ? 'Cambiar PDF de Costos' : 'Adjuntar PDF de Costos'}</span>
            <input id="pdf-upload-main" type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} disabled={isLoading} />
            </label>
            {pdfFile && (
            <div className="inline-flex items-center ml-3 text-sm text-slate-600 dark:text-slate-300">
                <span>{pdfFile.name}</span>
                <button onClick={() => setPdfFile(null)} className="ml-2 text-red-500 hover:text-red-700" disabled={isLoading}>&times;</button>
            </div>
            )}
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        
        <div className="mt-6 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            disabled={isLoading}
            >
            Cancelar
            </button>
            <button
            onClick={handleSubmit}
            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition flex items-center justify-center shadow-lg"
            disabled={isLoading || !emailText}
            >
            {isLoading ? <Spinner /> : 'Procesar Viaje'}
            </button>
        </div>
        </div>
    </div>
  );
};

export default EmailImporter;
