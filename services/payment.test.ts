import { normalizePaymentMethod } from "./payment.ts";

const cases: Array<[string, string]> = [
  ["Visa Débito Banco Ciudad", "Débito Ciudad"],
  ["Visa Crédito Banco Ciudad", "Crédito Ciudad"],
  ["Débito Macro", "Débito Macro"],
  ["Crédito Macro", "Crédito Macro"],
  ["Joy", "Joy"],
  ["Banco Ciudad", "Ciudad — tipo no detectado"],
  ["Banco Macro", "Macro — tipo no detectado"],
  ["texto sin forma de pago", "No detectado"],
];

for (const [input, expected] of cases) {
  const actual = normalizePaymentMethod(input).label;
  console.info("[payment.test]", { input, expected, actual });
  if (actual !== expected) {
    throw new Error(`normalizePaymentMethod("${input}") => "${actual}", expected "${expected}"`);
  }
}
