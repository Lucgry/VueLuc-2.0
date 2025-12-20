import React, { useMemo, useState } from "react";
import type { Trip, Flight } from "../types";
import { parseFlightEmail } from "../services/geminiService";
import { Spinner } from "./Spinner";
import { MailIcon } from "./icons/MailIcon";

interface EmailImporterProps {
  onClose: () => void;
  onAddTrip: (newTrip: Omit<Trip, "id" | "createdAt">) => Promise<void>;
  apiKey: string; // compatibilidad, no se usa
  onInvalidApiKey: () => void;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });

/* ------------------------------------------------------------------ */
/* Limpieza + reglas para IA (queda igual, está bien)                  */
/* ------------------------------------------------------------------ */

const buildAiInput = (raw: string): string => {
  const normalized = (raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  const stripped = normalized
    .replace(/^Conversación abierta\..*?\n+/im, "")
    .replace(/^Ir al contenido.*?\n+/im, "")
    .replace(/^Cómo usar Gmail.*?\n+/im, "")
    .replace(/^\d+\s+de\s+\d+[,.\s]+\d+.*?\n+/im, "")
    .trim();

  const lower = stripped.toLowerCase();
  const idxDetalle = lower.indexOf("detalle reserva");
  const startIdx = idxDetalle >= 0 ? idxDetalle : 0;

  const cutMarkers = [
    "regulaciones",
    "condiciones",
    "check-in",
    "equipaje",
    "devoluciones",
  ];

  let endIdx = stripped.length;
  for (const m of cutMarkers) {
    const i = lower.indexOf(m, startIdx);
    if (i >= 0) endIdx = Math.min(endIdx, i);
  }

  const core = stripped.slice(startIdx, endIdx).trim();

  const rules = [
    "REGLAS OBLIGATORIAS:",
    "- Extraer TODOS los tramos como vuelos individuales.",
    "- IDA = ORIGEN SLA. VUELTA = DESTINO SLA.",
    "- No asumir orden.",
    "- Manejar cruces de medianoche correctamente.",
    "- Devolver SOLO JSON válido.",
  ].join("\n");

  return [rules, "", core || stripped].join("\n");
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const EmailImporter: React.FC<EmailImporterProps> = ({
  onClose,
  onAddTrip,
  apiKey,
  onInvalidApiKey,
}) => {
  const [emailText, setEmailText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aiInput = useMemo(() => buildAiInput(emailText), [emailText]);

  const handleSubmit = async () => {
    if (!emailText.trim()) {
      setError("Por favor, pega el contenido del correo.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const pdfBase64 = pdfFile ? await fileToBase64(pdfFile) : null;

      const { flights, purchaseDate } = await parseFlightEmail(
        apiKey,
        aiInput,
        pdfBase64
      );

      if (!flights.length) {
        throw new Error("No se detectaron vuelos en el email.");
      }

      // 🔑 CLAVE: crear UN trip por vuelo
      for (const flight of flights) {
        const newTrip: Omit<Trip, "id" | "createdAt"> = {
          departureFlight: flight,
          returnFlight: null,
          purchaseDate,
        };

        await onAddTrip(newTrip);
      }

      onClose();
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : "Ocurrió un error inesperado.";

      if (message.includes("API Key")) {
        onInvalidApiKey();
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setPdfFile(e.target.files[0]);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MailIcon className="w-6 h-6" /> Importar Email
          </h2>
          <button onClick={onClose} className="text-3xl">
            ×
          </button>
        </div>

        <textarea
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          className="w-full h-48 p-3 rounded-md"
          placeholder="Pega aquí el contenido del email…"
          disabled={isLoading}
        />

        <div className="mt-4">
          <label className="cursor-pointer text-indigo-600">
            {pdfFile ? "Cambiar PDF" : "Adjuntar PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </label>
          {pdfFile && <span className="ml-2 text-sm">{pdfFile.name}</span>}
        </div>

        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} disabled={isLoading}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            {isLoading ? <Spinner /> : "Procesar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailImporter;
