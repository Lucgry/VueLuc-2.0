import type { Trip, Flight } from "../types";
import { parseFlightEmail } from "./geminiService.ts";
import { normalizePaymentMethod, shouldReplacePaymentMethod } from "./payment.ts";

export interface GmailImportSettings {
  lastScanAt?: string | null;
  processedMessageIds?: string[];
  lastResult?: string | null;
  lastError?: string | null;
}

export interface GmailImportMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
}

export interface GmailImportResult {
  messagesFound: number;
  alreadyProcessed: number;
  parsed: number;
  discarded: number;
  trips: Array<Omit<Trip, "id" | "createdAt">>;
  processedMessageIds: string[];
}

const GMAIL_SEARCH_QUERIES = [
  'newer_than:180d (from:jetsmart.com OR from:aerolineas.com.ar OR from:flybondi.com OR subject:reserva OR subject:itinerario OR subject:confirmacion OR subject:confirmación OR subject:compra OR subject:check-in OR subject:boarding OR subject:embarque)',
  'newer_than:180d (jetsmart OR "Aerolíneas Argentinas" OR aerolineas OR flybondi OR reserva OR itinerario OR confirmacion OR confirmación OR compra OR check-in OR boarding OR embarque)',
];

const MAX_MESSAGES_TO_READ = 25;
const MAX_PROCESSED_MESSAGE_IDS = 500;
const PAYMENT_BLOCK_PATTERNS = [
  /medio\s+de\s+pago/i,
  /m[eé]todo\s+de\s+pago/i,
  /forma\s+de\s+pago/i,
  /payment\s+method/i,
  /tarjeta/i,
  /\bpago\b/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /banco\s+ciudad/i,
  /bco\.?\s+ciudad/i,
  /banco\s+macro/i,
  /bco\.?\s+macro/i,
  /\bmacro\b/i,
  /\bciudad\b/i,
  /\bjoy\b/i,
  /\byoy\b/i,
  /mercado\s*pago/i,
  /\b\d{4}\b/,
];

function decodeBase64Url(value?: string): string {
  if (!value) return "";
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function getHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function collectBodyParts(payload: any, mimeType: string): string[] {
  const matches: string[] = [];

  const visit = (part: any) => {
    if (!part) return;

    if (part.mimeType === mimeType && part.body?.data) {
      matches.push(decodeBase64Url(part.body.data));
    }

    if (Array.isArray(part.parts)) {
      part.parts.forEach(visit);
    }
  };

  visit(payload);
  return matches;
}

function extractMessageText(payload: any): string {
  const plain = collectBodyParts(payload, "text/plain").join("\n").trim();
  if (plain) return plain;

  const html = collectBodyParts(payload, "text/html").join("\n").trim();
  if (html) return htmlToText(html);

  return decodeBase64Url(payload?.body?.data || "");
}

function looksLikeJetSmartMessage(message: Pick<GmailImportMessage, "subject" | "from" | "text">): boolean {
  const haystack = `${message.subject}\n${message.from}\n${message.text}`.toLowerCase();
  return haystack.includes("jetsmart") || haystack.includes("jet smart");
}

export function detectJetSmartPaymentFromText(
  text: string,
  subject = ""
): { candidatePaymentBlocks: string[]; detectedPaymentRaw: string | null } {
  const normalizedText = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!PAYMENT_BLOCK_PATTERNS.some((pattern) => pattern.test(lines[i]))) continue;

    const block = lines
      .slice(Math.max(0, i - 2), Math.min(lines.length, i + 5))
      .join(" | ");

    if (!blocks.includes(block)) blocks.push(block);
  }

  const sortedBlocks = blocks.sort((a, b) => {
    const aPayment = normalizePaymentMethod(a);
    const bPayment = normalizePaymentMethod(b);
    return bPayment.specificity - aPayment.specificity;
  });
  const detectedPaymentRaw =
    sortedBlocks.find((block) => normalizePaymentMethod(block).detected) || null;

  console.log("[jetsmartPaymentDetection]", {
    subject,
    candidatePaymentBlocks: sortedBlocks,
    detectedPaymentRaw,
    normalizedPaymentMethod: normalizePaymentMethod(detectedPaymentRaw),
  });

  return {
    candidatePaymentBlocks: sortedBlocks,
    detectedPaymentRaw,
  };
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/${path}`;
  console.log("gmailRequest", {
    url,
    hasAccessToken: !!accessToken,
    accessToken,
  });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    console.log("gmailError", {
      status: res.status,
      statusText: res.statusText,
      payload,
      url,
    });

    const reason =
      typeof payload === "object" && payload && "error" in payload
        ? JSON.stringify((payload as any).error)
        : text || res.statusText;

    throw new Error(`Gmail API error ${res.status} ${res.statusText}: ${reason}`);
  }

  return res.json() as Promise<T>;
}

async function searchRecentMessageIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const q of GMAIL_SEARCH_QUERIES) {
    const params = new URLSearchParams({
      q,
      maxResults: String(MAX_MESSAGES_TO_READ),
    });

    try {
      const data = await gmailFetch<{ messages?: Array<{ id: string }> }>(
        accessToken,
        `messages?${params.toString()}`
      );

      for (const message of data.messages || []) {
        if (!seen.has(message.id)) {
          seen.add(message.id);
          ids.push(message.id);
        }
      }
    } catch (error) {
      console.warn("Gmail search query failed, trying next query", { q, error });
    }

    if (ids.length > 0) break;
  }

  return ids.slice(0, MAX_MESSAGES_TO_READ);
}

async function readMessage(accessToken: string, id: string): Promise<GmailImportMessage> {
  const data = await gmailFetch<any>(
    accessToken,
    `messages/${encodeURIComponent(id)}?format=full`
  );

  const headers = data.payload?.headers || [];
  const internalDate = data.internalDate ? new Date(Number(data.internalDate)) : null;
  const headerDate = getHeader(headers, "Date");
  const parsedHeaderDate = headerDate ? new Date(headerDate) : null;
  const date =
    internalDate && !Number.isNaN(internalDate.getTime())
      ? internalDate.toISOString()
      : parsedHeaderDate && !Number.isNaN(parsedHeaderDate.getTime())
      ? parsedHeaderDate.toISOString()
      : new Date().toISOString();

  return {
    id,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    date,
    text: extractMessageText(data.payload || ""),
  };
}

function withGmailMetadata(
  trip: Omit<Trip, "id" | "createdAt">,
  message: GmailImportMessage,
  detectedPaymentRaw?: string | null
): Omit<Trip, "id" | "createdAt"> {
  const addMetadata = (flight: Flight | null): Flight | null => {
    if (!flight) return null;

    const paymentMethod = shouldReplacePaymentMethod(
      flight.paymentMethod,
      detectedPaymentRaw
    )
      ? normalizePaymentMethod(detectedPaymentRaw).label
      : normalizePaymentMethod(flight.paymentMethod).label;

    return {
      ...flight,
      paymentMethod,
      source: "gmail",
      gmailMessageId: message.id,
      gmailSubject: message.subject,
      gmailDate: message.date,
      gmailFrom: message.from,
    };
  };

  return {
    ...trip,
    purchaseDate: trip.purchaseDate || message.date,
    departureFlight: addMetadata(trip.departureFlight),
    returnFlight: addMetadata(trip.returnFlight),
  };
}

function normalizeIdentity(value?: string | null): string {
  return (value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeDateMinute(value?: string | null): string {
  const match = (value || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

function flightKey(flight: Flight | null): string | null {
  if (!flight) return null;

  const parts = [
    normalizeIdentity(flight.airline),
    normalizeIdentity(flight.flightNumber).replace(/[^A-Z0-9]/g, ""),
    normalizeDateMinute(flight.departureDateTime),
    normalizeIdentity(flight.departureAirportCode),
    normalizeIdentity(flight.arrivalAirportCode),
    normalizeIdentity(flight.bookingReference),
  ];

  if (!parts[1] || !parts[2] || !parts[3] || !parts[4]) return null;
  return parts.join("|");
}

function dedupeTrips(
  trips: Array<Omit<Trip, "id" | "createdAt">>
): Array<Omit<Trip, "id" | "createdAt">> {
  const seen = new Set<string>();
  const deduped: Array<Omit<Trip, "id" | "createdAt">> = [];

  for (const trip of trips) {
    const keys = [
      flightKey(trip.departureFlight),
      flightKey(trip.returnFlight),
    ].filter(Boolean) as string[];

    if (keys.length > 0 && keys.every((key) => seen.has(key))) {
      continue;
    }

    keys.forEach((key) => seen.add(key));
    deduped.push(trip);
  }

  return deduped;
}

function buildParserInput(
  message: GmailImportMessage,
  detectedPaymentRaw?: string | null,
  candidatePaymentBlocks: string[] = []
): string {
  return [
    `FECHA DE REFERENCIA DEL EMAIL: ${message.date}`,
    `GMAIL MESSAGE ID: ${message.id}`,
    `FROM: ${message.from}`,
    `SUBJECT: ${message.subject}`,
    detectedPaymentRaw ? `PAGO DETECTADO EN BODY: ${detectedPaymentRaw}` : "",
    candidatePaymentBlocks.length
      ? `BLOQUES CANDIDATOS DE PAGO:\n${candidatePaymentBlocks.join("\n")}`
      : "",
    "",
    message.text,
  ].filter(Boolean).join("\n");
}

export async function importTripsFromGmail(
  accessToken: string,
  settings: GmailImportSettings
): Promise<GmailImportResult> {
  const processed = new Set(settings.processedMessageIds || []);
  const messageIds = await searchRecentMessageIds(accessToken);
  const trips: Array<Omit<Trip, "id" | "createdAt">> = [];
  const newlyProcessedIds: string[] = [];

  let alreadyProcessed = 0;
  let parsed = 0;
  let discarded = 0;

  console.info("[gmailImport] mensajes encontrados", messageIds.length);

  for (const id of messageIds) {
    if (processed.has(id)) {
      alreadyProcessed += 1;
      continue;
    }

    try {
      const message = await readMessage(accessToken, id);
      const jetSmartPayment = looksLikeJetSmartMessage(message)
        ? detectJetSmartPaymentFromText(message.text, message.subject)
        : { candidatePaymentBlocks: [], detectedPaymentRaw: null };
      const parserInput = buildParserInput(
        message,
        jetSmartPayment.detectedPaymentRaw,
        jetSmartPayment.candidatePaymentBlocks
      );
      const parsedTrips = await parseFlightEmail("", parserInput, null);

      if (parsedTrips.length === 0) {
        discarded += 1;
      } else {
        parsed += 1;
        const tripsWithMetadata = parsedTrips.map((trip) =>
          withGmailMetadata(trip, message, jetSmartPayment.detectedPaymentRaw)
        );
        for (const trip of tripsWithMetadata) {
          for (const flight of [trip.departureFlight, trip.returnFlight]) {
            if (!flight) continue;
            console.info("[gmailImport] payment detection", {
              subject: message.subject,
              detectedPaymentRaw: flight.paymentMethod,
              normalizedPaymentMethod: normalizePaymentMethod(flight.paymentMethod),
              detectedAmount: flight.cost,
              source: flight.source || "gmail/body",
              gmailMessageId: message.id,
            });
          }
        }
        trips.push(...tripsWithMetadata);
      }

      newlyProcessedIds.push(id);
    } catch (error) {
      discarded += 1;
      console.warn("[gmailImport] mensaje descartado", { id, error });
    }
  }

  const processedMessageIds = [
    ...newlyProcessedIds,
    ...(settings.processedMessageIds || []),
  ].slice(0, MAX_PROCESSED_MESSAGE_IDS);

  console.info("[gmailImport] resumen", {
    messagesFound: messageIds.length,
    alreadyProcessed,
    parsed,
    discarded,
    trips: trips.length,
  });

  const dedupedTrips = dedupeTrips(trips);

  return {
    messagesFound: messageIds.length,
    alreadyProcessed,
    parsed,
    discarded,
    trips: dedupedTrips,
    processedMessageIds,
  };
}
