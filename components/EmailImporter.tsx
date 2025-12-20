import React, { useMemo, useState } from 'react';
import type { Trip } from '../types';
import { parseFlightEmail } from '../services/geminiService';
import { Spinner } from './Spinner';
import { MailIcon } from './icons/MailIcon';

interface EmailImporterProps {
  onClose: () => void;
  onAddTrip: (newTrip: Omit<Trip, 'id' | 'createdAt'>) => Promise<void>;
  apiKey: string;
  onInvalidApiKey: () => void;
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

/**
 * Intención:
 * - Reducir ruido (Gmail + textos legales enormes)
 * - Mantener lo esencial (itinerario/reserva/fechas/códigos/transacciones)
 * - Inyectar reglas para que el modelo clasifique ida/vuelta correctamente
 */
const buildAiInput = (raw: string): string => {
  const normalized = (raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  // 1) Sacar “basura” típica del encabezado de Gmail / UI
  // (no es perfecto, pero ayuda)
  const stripped = normalized
    .replace(/^Conversación abierta\..*?\n+/im, '')
    .replace(/^Ir al contenido.*?\n+/im, '')
    .replace(/^Cómo usar Gmail.*?\n+/im, '')
    .replace(/^\d+\s+de\s+\d+[,.\s]+\d+.*?\n+/im, '') // “57 de 25,035”
    .trim();

  // 2) Intentar quedarnos con el bloque “bueno”
  // Preferencia:
  // - “Itinerario de su Reserva” / “DETALLE RESERVA” / “TRANSACCIONES”
  // - Si no aparece, usar lo que haya igual (fallback)
  const lower = stripped.toLowerCase();

  const idxItin = lower.indexOf('itinerario de su reserva');
  const idxDetalle = lower.indexOf('detalle reserva');
  const idxTrans = lower.indexOf('transacciones');

  const startIdx = [idxItin, idxDetalle, idxTrans].filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;

  // Cortamos también al final para no mandar 200 páginas de regulaciones
  // Buscamos un “corte” típico:
  const cutMarkers = [
    'regulaciones particulares',
    'detalles de la tarifa',
    'condiciones generales',
    'check-in y presentación',
    'equipaje',
    'gift card',
    'devoluciones',
  ];
  let endIdx = stripped.length;

  for (const m of cutMarkers) {
    const i = lower.indexOf(m, Math.max(0, startIdx));
    if (i >= 0) {
      endIdx = Math.min(endIdx, i);
    }
  }

  const core = stripped.slice(startIdx, endIdx).trim();

  // 3) Inyectar reglas explícitas (para JetSMART y tu caso SLA/AEP)
  // Esto le “fija” al modelo cómo clasificar y cómo manejar medianoche.
  const rules = [
    'REGLAS DE PARSEO (OBLIGATORIAS):',
    '- Extraer TODOS los tramos del itinerario como vuelos individuales (aunque el mail muestre primero la vuelta).',
    '- Clasificación Ida/Vuelta: IDA es el tramo cuyo ORIGEN es SLA (Salta). VUELTA es el tramo cuyo DESTINO es SLA (Salta).',
    '- No asumir “primer tramo = ida”.',
    '- Si la llegada cae después de medianoche: si la fecha de llegada está explícita, usarla. Si NO está explícita y la hora de llegada < hora de salida, sumar 1 día.',
    '- Extraer: aerolínea, número de vuelo, origen/destino (ciudad + código), fecha/hora salida/llegada, reserva/PNR, costo total si aparece, método de pago si aparece (ej: XXXX-6007).',
  ].join('\n');

  // 4) Armamos el input final
  // Nota: dejamos el raw completo como “fallback” acotado por tamaño si el core quedó chico.
  const fallback = stripped.length > 6000 ? stripped.slice(0, 6000) : stripped;

  const finalText = [
    rules,
    '',
    'CONTENIDO PRINCIPAL (priorizar este bloque):',
    core || '(No se detectó bloque de itinerario; usar el contenido completo a continuación.)',
    '',
    'CONTENIDO COMPLETO (fallback, puede contener ruido):',
    fallback,
  ].join('\n');

  return finalText;
};

const EmailImporter: React.FC<EmailImporterProps> = ({ onClose, onAddTrip, apiKey, onInvalidApiKey }) => {
  const [emailText, setEmailText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aiInput = useMemo(() => buildAiInput(emailText), [emailText]);

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

      // Enviamos el texto “limpio + reglas”
      const newTrip = await parseFlightEmail(apiKey, aiInput, pdfBase64);
      await onAddTrip(newTrip);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
      if (message.includes('La API Key no es válida')) {
        onInvalidApiKey();
      } else {
        setError(message);
      }
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
    <div
      className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-100 dark:bg-slate-800 rounded-xl shadow-neumo-light-out dark:shadow-neumo-dark-out p-6 md:p-8 w-full max-w-2xl transform transition-all"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-start sm:items-center space-x-4">
            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-full shadow-neumo-light-out dark:shadow-neumo-dark-out mt-1 sm:mt-0">
              <MailIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Agregar Viaje con IA</h2>
              <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                Pega el email de confirmación y adjunta el PDF del costo (opcional).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 text-3xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-2 text-slate-700 dark:text-slate-300 text-sm mb-4 p-3 rounded-lg shadow-neumo-light-in dark:shadow-neumo-dark-in">
          <p>
            <b>Tip:</b> Pega el contenido del mail de la aerolínea. Si el texto es muy largo (regulaciones), igual funciona:
            la app intenta priorizar el bloque “DETALLE RESERVA / Itinerario”.
          </p>
        </div>

        <textarea
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          placeholder="Pega aquí el contenido completo del email..."
          className="w-full h-48 p-3 border-none rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 transition shadow-neumo-light-in dark:shadow-neumo-dark-in"
          disabled={isLoading}
        />

        <div className="mt-4">
          <label
            htmlFor="pdf-upload-main"
            className="cursor-pointer inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in px-3 py-2 rounded-md transition-shadow duration-200"
          >
            <span>{pdfFile ? 'Cambiar PDF de Costos' : 'Adjuntar PDF de Costos'}</span>
            <input
              id="pdf-upload-main"
              type="file"
              className="hidden"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </label>

          {pdfFile && (
            <div className="inline-flex items-center ml-3 text-sm text-slate-600 dark:text-slate-300">
              <span>{pdfFile.name}</span>
              <button
                onClick={() => setPdfFile(null)}
                className="ml-2 text-red-500 hover:text-red-700"
                disabled={isLoading}
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="mt-6 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-slate-800 dark:text-slate-200 rounded-md transition-shadow duration-200 shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in"
            disabled={isLoading}
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            className="w-full sm:w-auto px-6 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-semibold rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-shadow duration-200 flex items-center justify-center shadow-neumo-light-out dark:shadow-neumo-dark-out active:shadow-neumo-light-in dark:active:shadow-neumo-dark-in"
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
