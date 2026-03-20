export type CashClosureAmountsInput = {
  theoretical_base: number;
  cash_declared?: number;
  card_declared?: number;
  satispay_declared?: number;
  other_declared?: number;
  receipt_image_url?: string | null;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeCashClosureTotals(input: CashClosureAmountsInput) {
  const cash = Number(input.cash_declared ?? 0);
  const card = Number(input.card_declared ?? 0);
  const satispay = Number(input.satispay_declared ?? 0);
  const other = Number(input.other_declared ?? 0);
  const theoretical = Number(input.theoretical_base ?? 0);

  const declared_total = round2(cash + card + satispay + other);
  const delta = round2(declared_total - theoretical);

  return {
    declared_total,
    delta,
  };
}

export function buildCashClosureAlerts(input: CashClosureAmountsInput) {
  const cash = Number(input.cash_declared ?? 0);
  const card = Number(input.card_declared ?? 0);
  const satispay = Number(input.satispay_declared ?? 0);
  const other = Number(input.other_declared ?? 0);
  const theoretical = Number(input.theoretical_base ?? 0);

  const { declared_total, delta } = computeCashClosureTotals(input);

  const alerts: string[] = [];

  if (!input.receipt_image_url) {
    alerts.push("MISSING_RECEIPT_IMAGE");
  }

  if (Math.abs(delta) > 5) {
    alerts.push("DELTA_OVER_THRESHOLD");
  }

  if (
    theoretical === 0 &&
    cash === 0 &&
    card === 0 &&
    satispay === 0 &&
    other === 0
  ) {
    alerts.push("ALL_VALUES_ZERO");
  }

  if (declared_total === 0 && theoretical > 0) {
    alerts.push("DECLARED_ZERO_WITH_THEORETICAL");
  }

  return alerts;
}
