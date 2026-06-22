import { detectJetSmartPaymentFromText } from "./gmailImport.ts";
import { normalizePaymentMethod } from "./payment.ts";

const cases: Array<[string, string]> = [
  [
    "DETALLE RESERVA\nMedio de pago\nVisa Débito Banco Ciudad terminada en 9417\nTotal $123",
    "Débito Ciudad",
  ],
  [
    "Tu compra JetSmart\nMétodo de pago: Visa Crédito Banco Macro **** 5603",
    "Crédito Macro",
  ],
  [
    "Pago\nTarjeta Joy\nImporte total $123",
    "Joy",
  ],
  [
    "Payment method Mastercard Banco Macro ending 1234",
    "Macro — tipo no detectado",
  ],
  [
    "Forma de pago\nVisa Crédito terminada en 8769",
    "Crédito Ciudad",
  ],
];

for (const [text, expected] of cases) {
  const detection = detectJetSmartPaymentFromText(text, "JetSmart test");
  const actual = normalizePaymentMethod(detection.detectedPaymentRaw).label;
  console.info("[jetsmartPayment.test]", {
    expected,
    actual,
    detectedPaymentRaw: detection.detectedPaymentRaw,
  });

  if (actual !== expected) {
    throw new Error(`JetSmart payment detection => "${actual}", expected "${expected}"`);
  }
}
