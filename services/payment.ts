export type PaymentMethodId =
  | "debito_ciudad"
  | "credito_ciudad"
  | "ciudad_tipo_no_detectado"
  | "debito_macro"
  | "credito_macro"
  | "macro_tipo_no_detectado"
  | "joy"
  | "mercado_pago"
  | "debito_nacion"
  | "debito_banco_no_detectado"
  | "credito_banco_no_detectado"
  | "tarjeta_tipo_no_detectado"
  | "otro"
  | "unknown";

export type PaymentSource = "gmail" | "email" | "pdf" | "manual" | null;

export interface NormalizedPaymentMethod {
  id: PaymentMethodId;
  label: string;
  raw: string | null;
  detected: boolean;
  specificity: number;
}

const UNKNOWN_PAYMENT: NormalizedPaymentMethod = {
  id: "unknown",
  label: "No detectado",
  raw: null,
  detected: false,
  specificity: 0,
};

export const PAYMENT_METHOD_OPTIONS = [
  "Débito Ciudad",
  "Débito Macro",
  "Crédito Ciudad",
  "Crédito Macro",
  "Débito Nación",
];

function normalizeText(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

export function normalizePaymentMethod(rawText?: string | null): NormalizedPaymentMethod {
  const raw = typeof rawText === "string" ? rawText.trim() : "";
  const text = normalizeText(raw);

  if (!text || text === "unknown" || text === "no detectado" || text === "n/a") {
    return { ...UNKNOWN_PAYMENT, raw: raw || null };
  }

  if (text === "otro" || text === "other") {
    return { id: "otro", label: "Otro", raw, detected: true, specificity: 20 };
  }

  const isDebit = hasAny(text, ["debito", "debit", "visa debito", "mastercard debito"]);
  const isCredit = hasAny(text, ["credito", "credit", "visa credito", "mastercard credito"]);
  const isCiudad = hasAny(text, [
    "banco ciudad",
    "bco ciudad",
    "ciudad",
    "tarjeta ciudad",
  ]);
  const isMacro = hasAny(text, [
    "banco macro",
    "bco macro",
    "macro",
    "tarjeta macro",
  ]);
  const isJoy = hasAny(text, ["joy", "yoy", "tarjeta joy", "tarjeta yoy"]);
  const isMercadoPago = hasAny(text, ["mercado pago", "mercadopago", "mpago"]);
  const isNacion = hasAny(text, ["banco nacion", "banco nación", "nacion", "nación"]);
  const isCardBrand = hasAny(text, ["visa", "mastercard", "master card", "amex", "american express"]);

  if (raw.includes("9417")) {
    return { id: "debito_ciudad", label: "Débito Ciudad", raw, detected: true, specificity: 100 };
  }
  if (raw.includes("8769")) {
    return { id: "credito_ciudad", label: "Crédito Ciudad", raw, detected: true, specificity: 100 };
  }
  if (raw.includes("6007")) {
    return { id: "debito_macro", label: "Débito Macro", raw, detected: true, specificity: 100 };
  }
  if (raw.includes("5603")) {
    return { id: "credito_macro", label: "Crédito Macro", raw, detected: true, specificity: 100 };
  }
  if (raw.includes("8059")) {
    return { id: "joy", label: "Joy", raw, detected: true, specificity: 100 };
  }
  if (raw.includes("7005")) {
    return { id: "debito_nacion", label: "Débito Nación", raw, detected: true, specificity: 100 };
  }

  if (isCiudad && isDebit) {
    return { id: "debito_ciudad", label: "Débito Ciudad", raw, detected: true, specificity: 90 };
  }
  if (isCiudad && isCredit) {
    return { id: "credito_ciudad", label: "Crédito Ciudad", raw, detected: true, specificity: 90 };
  }
  if (isMacro && isDebit) {
    return { id: "debito_macro", label: "Débito Macro", raw, detected: true, specificity: 90 };
  }
  if (isMacro && isCredit) {
    return { id: "credito_macro", label: "Crédito Macro", raw, detected: true, specificity: 90 };
  }

  if (isJoy) {
    return { id: "joy", label: "Joy", raw, detected: true, specificity: 80 };
  }
  if (isMercadoPago) {
    return { id: "mercado_pago", label: "Mercado Pago", raw, detected: true, specificity: 80 };
  }
  if (isNacion && isDebit) {
    return { id: "debito_nacion", label: "Débito Nación", raw, detected: true, specificity: 80 };
  }
  if (isDebit) {
    return {
      id: "debito_banco_no_detectado",
      label: "Débito — banco no detectado",
      raw,
      detected: true,
      specificity: 40,
    };
  }
  if (isCredit) {
    return {
      id: "credito_banco_no_detectado",
      label: "Crédito — banco no detectado",
      raw,
      detected: true,
      specificity: 40,
    };
  }
  if (isCiudad) {
    return {
      id: "ciudad_tipo_no_detectado",
      label: "Ciudad — tipo no detectado",
      raw,
      detected: true,
      specificity: 50,
    };
  }
  if (isMacro) {
    return {
      id: "macro_tipo_no_detectado",
      label: "Macro — tipo no detectado",
      raw,
      detected: true,
      specificity: 50,
    };
  }
  if (isCardBrand) {
    return {
      id: "tarjeta_tipo_no_detectado",
      label: "Tarjeta — tipo no detectado",
      raw,
      detected: true,
      specificity: 30,
    };
  }

  return { ...UNKNOWN_PAYMENT, raw };
}

export function formatPaymentMethod(rawText?: string | null): string {
  return normalizePaymentMethod(rawText).label;
}

export function shouldReplacePaymentMethod(
  current?: string | null,
  candidate?: string | null
): boolean {
  const currentPayment = normalizePaymentMethod(current);
  const candidatePayment = normalizePaymentMethod(candidate);

  if (!candidatePayment.detected) return false;
  if (!currentPayment.detected) return true;
  return candidatePayment.specificity > currentPayment.specificity;
}

export function shouldReplaceFlightPayment(
  currentMethod?: string | null,
  currentSource?: PaymentSource,
  candidateMethod?: string | null,
  candidateSource?: PaymentSource
): boolean {
  const candidatePayment = normalizePaymentMethod(candidateMethod);
  if (!candidatePayment.detected) return false;

  if (currentSource === "manual") {
    const currentPayment = normalizePaymentMethod(currentMethod);
    if (
      candidateSource === "pdf" &&
      currentPayment.detected &&
      currentPayment.id !== candidatePayment.id
    ) {
      console.warn("Conflicto de forma de pago: se conserva valor manual", {
        currentPayment,
        candidatePayment,
        candidateSource,
      });
    }
    return false;
  }

  return shouldReplacePaymentMethod(currentMethod, candidateMethod);
}

export function chooseBetterPaymentMethod(
  current?: string | null,
  candidate?: string | null
): string | null {
  if (shouldReplacePaymentMethod(current, candidate)) {
    return normalizePaymentMethod(candidate).label;
  }
  return current ? normalizePaymentMethod(current).label : null;
}
