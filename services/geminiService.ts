// services/geminiService.ts

import type { Trip, Flight } from '../types';

// ⚠️ URL DE TU CLOUD FUNCTION DESPLEGADA
const CLOUD_FUNCTION_URL = "https://us-central1-vueluc-app.cloudfunctions.net/parseFlightEmailSecure"; 

/**
 * Envía el email de vuelo y el PDF adjunto a la Cloud Function de Firebase
 * para el parseo SEGURO por Gemini.
 * La Cloud Function (backend) es la que usa la Clave API.
 * * @param emailText El texto del correo a analizar.
 * @param pdfBase64 Contenido opcional del PDF en base64.
 * @returns Una promesa que resuelve con la estructura de viaje extraída.
 */
export const parseFlightEmail = async (emailText: string, pdfBase64?: string | null): Promise<Omit<Trip, 'id' | 'createdAt'>> => {
    // 1. Ya no necesitamos la clave aquí, así que la removemos del argumento, si estaba.
    // 2. Comprobamos la existencia del email.
    if (!emailText) {
        throw new Error("El texto del email no puede estar vacío.");
    }

    try {
        // Realiza una petición POST a la Cloud Function de Firebase
        const response = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Envía todos los datos necesarios para que la Cloud Function haga el parseo
            body: JSON.stringify({
                emailText: emailText,
                pdfBase64: pdfBase64,
            }),
        });

        // La Cloud Function debería retornar un error 400/500 si algo falla
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error || `Error en el servidor de IA (HTTP ${response.status}).`);
        }

        // La respuesta de la Cloud Function debe ser la estructura final de la Trip
        const finalTrip = await response.json();
        return finalTrip as Omit<Trip, 'id' | 'createdAt'>;

    } catch (error) {
        console.error("Error al conectar con el backend seguro de Gemini:", error);
        const message = error instanceof Error ? error.message : "Un error desconocido ocurrió durante el procesamiento.";
        
        // Retornamos errores más específicos al usuario
        if (message.includes("API Key") || message.includes("servidor de IA")) {
            throw new Error("Error de configuración en el backend. La clave secreta de Gemini podría no ser válida.");
        }
        
        throw new Error(`Error al procesar el email: ${message}`);
    }
};
