import { createGrantDbClient, hasSupabaseEnv } from "./supabase";
import type {
  ApprovalDecision,
  AuditLog,
  ClaimPackage,
  GrantRule,
  Invoice,
  PackageException,
  Recommendation,
  Transaction,
} from "./types";

export type AppData = {
  configured: boolean;
  packages: ClaimPackage[];
  rules: GrantRule[];
  transactions: Transaction[];
  selectedPackage: ClaimPackage | null;
  invoices: Invoice[];
  recommendations: Recommendation[];
  exceptions: PackageException[];
  approvals: ApprovalDecision[];
  auditLogs: AuditLog[];
  error?: string;
};

export async function loadAppData(selectedPackageId?: string): Promise<AppData> {
  if (!hasSupabaseEnv()) {
    return {
      configured: false,
      packages: [],
      rules: [],
      transactions: [],
      selectedPackage: null,
      invoices: [],
      recommendations: [],
      exceptions: [],
      approvals: [],
      auditLogs: [],
      error: "Supabase env is missing. Run `vercel env pull .env.local`.",
    };
  }

  const supabase = createGrantDbClient();

  const [
    packagesResult,
    rulesResult,
    transactionsResult,
  ] = await Promise.all([
    supabase
      .from("claim_packages")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("grant_rules")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  const firstError =
    packagesResult.error || rulesResult.error || transactionsResult.error;
  if (firstError) {
    return {
      configured: true,
      packages: [],
      rules: [],
      transactions: [],
      selectedPackage: null,
      invoices: [],
      recommendations: [],
      exceptions: [],
      approvals: [],
      auditLogs: [],
      error: firstError.message,
    };
  }

  const packages = (packagesResult.data ?? []) as ClaimPackage[];
  const selectedPackage =
    packages.find((pkg) => pkg.id === selectedPackageId) ?? packages[0] ?? null;

  if (!selectedPackage) {
    return {
      configured: true,
      packages,
      rules: (rulesResult.data ?? []) as GrantRule[],
      transactions: (transactionsResult.data ?? []) as Transaction[],
      selectedPackage: null,
      invoices: [],
      recommendations: [],
      exceptions: [],
      approvals: [],
      auditLogs: [],
    };
  }

  const [recommendationsResult, exceptionsResult, approvalsResult, auditResult] =
    await Promise.all([
      supabase
        .from("claim_recommendations")
        .select("*")
        .eq("package_id", selectedPackage.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("exceptions")
        .select("*")
        .eq("package_id", selectedPackage.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("approval_decisions")
        .select("*")
        .eq("package_id", selectedPackage.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("*")
        .eq("object_id", selectedPackage.id)
        .order("created_at", { ascending: false }),
    ]);

  const invoiceIds = [
    ...new Set([
      ...((recommendationsResult.data ?? []) as Recommendation[]).map(
        (rec) => rec.invoice_id,
      ),
      ...((exceptionsResult.data ?? []) as PackageException[]).map(
        (exception) => exception.invoice_id,
      ),
    ]),
  ].filter(Boolean);

  const invoicesResult =
    invoiceIds.length > 0
      ? await supabase.from("invoices").select("*").in("id", invoiceIds)
      : { data: [], error: null };

  const detailError =
    recommendationsResult.error ||
    exceptionsResult.error ||
    approvalsResult.error ||
    auditResult.error ||
    invoicesResult.error;

  return {
    configured: true,
    packages,
    rules: (rulesResult.data ?? []) as GrantRule[],
    transactions: (transactionsResult.data ?? []) as Transaction[],
    selectedPackage,
    invoices: (invoicesResult.data ?? []) as Invoice[],
    recommendations: (recommendationsResult.data ?? []) as Recommendation[],
    exceptions: (exceptionsResult.data ?? []) as PackageException[],
    approvals: (approvalsResult.data ?? []) as ApprovalDecision[],
    auditLogs: (auditResult.data ?? []) as AuditLog[],
    error: detailError?.message,
  };
}
