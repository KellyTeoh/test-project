import type { ActualsRow, GrantRule } from "./types";

export type RuleResult = {
  verdict: "eligible" | "exception";
  confidence: number;
  detail: {
    cost_center: boolean;
    program_code: boolean;
    spend_category: boolean;
    date_range: boolean;
    under_cap: boolean;
    duplicate: boolean;
    failures: string[];
  };
  exceptions: Array<{ type: string; description: string }>;
};

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function inDateRange(date: string, start: string, end: string) {
  const value = new Date(date).getTime();
  return value >= new Date(start).getTime() && value <= new Date(end).getTime();
}

export function normalizeActualsRow(row: Record<string, unknown>): ActualsRow {
  return {
    invoice_number: normalize(row.invoice_number),
    vendor_name: normalize(row.vendor_name),
    cost_center: normalize(row.cost_center).toUpperCase(),
    program_code: normalize(row.program_code).toUpperCase(),
    spend_category: normalize(row.spend_category).toLowerCase(),
    amount: Number(row.amount),
    transaction_date: normalize(row.transaction_date),
  };
}

export function validateActualsRow(row: ActualsRow) {
  const required = [
    "invoice_number",
    "vendor_name",
    "cost_center",
    "program_code",
    "spend_category",
    "amount",
    "transaction_date",
  ] as const;

  const missing = required.filter((field) => {
    const value = row[field];
    return value === "" || value === null || Number.isNaN(value);
  });

  if (missing.length > 0) {
    return `Missing or invalid fields: ${missing.join(", ")}`;
  }

  if (Number(row.amount) < 0) {
    return "Amount must be zero or greater";
  }

  if (Number.isNaN(new Date(row.transaction_date).getTime())) {
    return "transaction_date must be a valid date";
  }

  return null;
}

export function scoreInvoice({
  row,
  rule,
  packageRunningTotal,
  duplicate,
}: {
  row: ActualsRow;
  rule: GrantRule;
  packageRunningTotal: number;
  duplicate: boolean;
}): RuleResult {
  const checks = {
    cost_center: rule.allowed_cost_centers.includes(row.cost_center),
    program_code: rule.allowed_programs.includes(row.program_code),
    spend_category: rule.allowed_categories.includes(row.spend_category),
    date_range: inDateRange(row.transaction_date, rule.start_date, rule.end_date),
    under_cap: packageRunningTotal + row.amount <= Number(rule.claim_cap),
    duplicate: !duplicate,
  };

  const exceptions: RuleResult["exceptions"] = [];
  if (!row.cost_center || !checks.cost_center) {
    exceptions.push({
      type: row.cost_center ? "unmatched_cost_center" : "missing_cost_center",
      description: `${row.invoice_number} uses cost center ${row.cost_center || "blank"}, which is not allowed for ${rule.grant_name}.`,
    });
  }
  if (!checks.program_code) {
    exceptions.push({
      type: "unmatched_program",
      description: `${row.invoice_number} is assigned to ${row.program_code || "blank"}, outside the active grant programs.`,
    });
  }
  if (!checks.spend_category) {
    exceptions.push({
      type: "unmatched_category",
      description: `${row.invoice_number} has spend category ${row.spend_category || "blank"}, which is not eligible for this grant.`,
    });
  }
  if (!checks.date_range) {
    exceptions.push({
      type: "date_out_of_range",
      description: `${row.invoice_number} is dated ${row.transaction_date}, outside ${rule.start_date} to ${rule.end_date}.`,
    });
  }
  if (!checks.under_cap) {
    exceptions.push({
      type: "over_cap",
      description: `${row.invoice_number} would take the package above the ${rule.grant_name} cap of ${Number(rule.claim_cap).toLocaleString()}.`,
    });
  }
  if (!checks.duplicate) {
    exceptions.push({
      type: "duplicate",
      description: `${row.invoice_number} already exists in the invoice register and needs reviewer confirmation before claiming.`,
    });
  }

  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    verdict: failures.length === 0 ? "eligible" : "exception",
    confidence: failures.length === 0 ? 0.96 : 0.72,
    detail: { ...checks, failures },
    exceptions,
  };
}
