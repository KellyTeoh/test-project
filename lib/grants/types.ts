export type ActualsRow = {
  invoice_number: string;
  vendor_name: string;
  cost_center: string;
  program_code: string;
  spend_category: string;
  amount: number;
  transaction_date: string;
};

export type GrantRule = {
  id: string;
  grant_name: string;
  allowed_cost_centers: string[];
  allowed_programs: string[];
  allowed_categories: string[];
  start_date: string;
  end_date: string;
  claim_cap: number;
  is_active: boolean;
  created_at?: string;
};

export type ClaimPackage = {
  id: string;
  report_id: string | null;
  grant_rule_id: string | null;
  package_name: string;
  status: "pending_review" | "approved" | "returned" | "submitted";
  total_recommended: number;
  invoice_count: number;
  exception_count: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  vendor_name: string;
  total_amount: number;
  transaction_date: string;
  cost_center: string;
  program_code: string;
};

export type Transaction = ActualsRow & {
  id: string;
  report_id: string;
  created_at: string;
};

export type Recommendation = {
  id: string;
  invoice_id: string;
  package_id: string;
  eligibility_verdict: "eligible" | "ineligible" | "exception";
  eligibility_confidence: number;
  rule_match_detail: Record<string, boolean | string[]>;
};

export type PackageException = {
  id: string;
  invoice_id: string;
  package_id: string;
  exception_type: string;
  description: string;
  resolution: string | null;
  created_at: string;
};

export type ApprovalDecision = {
  id: string;
  package_id: string;
  decision: "approved" | "rejected" | "returned";
  comment: string;
  decided_at: string;
};

export type AuditLog = {
  id: string;
  object_type: string;
  object_id: string;
  action: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
};
