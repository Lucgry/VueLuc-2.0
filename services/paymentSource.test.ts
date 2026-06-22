import { normalizePaymentMethod, shouldReplaceFlightPayment } from "./payment.ts";

const cases: Array<{
  name: string;
  currentMethod: string | null;
  currentSource: "manual" | "gmail" | "pdf" | null;
  candidateMethod: string | null;
  candidateSource: "manual" | "gmail" | "pdf" | null;
  expected: boolean;
}> = [
  {
    name: "manual payment is not replaced by Gmail unknown",
    currentMethod: "Débito Ciudad",
    currentSource: "manual",
    candidateMethod: "No detectado",
    candidateSource: "gmail",
    expected: false,
  },
  {
    name: "manual payment is not replaced by Gmail incomplete",
    currentMethod: "Débito Ciudad",
    currentSource: "manual",
    candidateMethod: "Banco Ciudad",
    candidateSource: "gmail",
    expected: false,
  },
  {
    name: "unknown non-manual payment can be completed",
    currentMethod: "No detectado",
    currentSource: "gmail",
    candidateMethod: "Crédito Macro",
    candidateSource: "gmail",
    expected: true,
  },
  {
    name: "manual payment is not automatically replaced by PDF conflict",
    currentMethod: "Débito Ciudad",
    currentSource: "manual",
    candidateMethod: "Crédito Macro",
    candidateSource: "pdf",
    expected: false,
  },
];

for (const testCase of cases) {
  const actual = shouldReplaceFlightPayment(
    testCase.currentMethod,
    testCase.currentSource,
    testCase.candidateMethod,
    testCase.candidateSource
  );

  console.info("[paymentSource.test]", {
    name: testCase.name,
    current: normalizePaymentMethod(testCase.currentMethod),
    candidate: normalizePaymentMethod(testCase.candidateMethod),
    expected: testCase.expected,
    actual,
  });

  if (actual !== testCase.expected) {
    throw new Error(`${testCase.name}: expected ${testCase.expected}, got ${actual}`);
  }
}
