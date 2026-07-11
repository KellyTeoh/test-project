import { createGrantDbClient } from "@/lib/grants/supabase";
import { normalizeActualsRow, scoreInvoice, validateActualsRow } from "@/lib/grants/rule-engine";
import type { ActualsRow, GrantRule } from "@/lib/grants/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXPECTED_COLUMNS = [
  "invoice_number",
  "vendor_name",
  "cost_center",
  "program_code",
  "spend_category",
  "amount",
  "transaction_date",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      filename?: string;
      rows?: Array<Record<string, unknown>>;
      reportDate?: string;
    };

    if (!body.rows?.length) {
      return NextResponse.json(
        { error: "File format not recognised. Expected columns: " + EXPECTED_COLUMNS.join(", ") },
        { status: 400 },
      );
    }

    const rows = body.rows.map(normalizeActualsRow);
    const invalid = rows.map(validateActualsRow).find(Boolean);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const supabase = createGrantDbClient();
    const { data: rules, error: rulesError } = await supabase
      .from("grant_rules")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (rulesError) throw rulesError;
    const rule = (rules?.[0] ?? null) as GrantRule | null;
    if (!rule) {
      return NextResponse.json(
        { error: "No active grant rules found. Add a rule before processing." },
        { status: 409 },
      );
    }

    const reportDate =
      body.reportDate ?? rows[0]?.transaction_date ?? new Date().toISOString().slice(0, 10);

    const { data: report, error: reportError } = await supabase
      .from("actuals_reports")
      .insert({
        filename: body.filename ?? "uploaded_actuals.csv",
        source_path: `/uploads/${body.filename ?? "uploaded_actuals.csv"}`,
        report_date: reportDate,
        row_count: rows.length,
        status: "ready",
      })
      .select()
      .single();
    if (reportError) throw reportError;

    const transactionRows = rows.map((row) => ({
      ...row,
      report_id: report.id,
    }));
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert(transactionRows);
    if (transactionError) throw transactionError;

    const { data: existingInvoices, error: existingError } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .in(
        "invoice_number",
        rows.map((row) => row.invoice_number),
      );
    if (existingError) throw existingError;

    const duplicateBeforeIngest = new Set(
      (existingInvoices ?? []).map((invoice) => invoice.invoice_number),
    );
    const seenInUpload = new Set<string>();

    const invoiceRows = rows.map((row) => ({
      invoice_number: row.invoice_number,
      vendor_name: row.vendor_name,
      total_amount: row.amount,
      transaction_date: row.transaction_date,
      cost_center: row.cost_center,
      program_code: row.program_code,
    }));

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .upsert(invoiceRows, { onConflict: "invoice_number" })
      .select();
    if (invoiceError) throw invoiceError;

    const { data: claimPackage, error: packageError } = await supabase
      .from("claim_packages")
      .insert({
        report_id: report.id,
        grant_rule_id: rule.id,
        package_name: `${rule.grant_name} - ${new Date(reportDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`,
        status: "pending_review",
        total_recommended: 0,
        invoice_count: 0,
        exception_count: 0,
      })
      .select()
      .single();
    if (packageError) throw packageError;

    let runningTotal = 0;
    let eligibleCount = 0;
    let exceptionCount = 0;
    const recommendations = [];
    const exceptions = [];

    for (const row of rows) {
      const invoice = invoices?.find(
        (candidate) => candidate.invoice_number === row.invoice_number,
      );
      if (!invoice) continue;

      const duplicate =
        duplicateBeforeIngest.has(row.invoice_number) || seenInUpload.has(row.invoice_number);
      const result = scoreInvoice({
        row: row as ActualsRow,
        rule,
        packageRunningTotal: runningTotal,
        duplicate,
      });
      seenInUpload.add(row.invoice_number);

      if (result.verdict === "eligible") {
        runningTotal += row.amount;
        eligibleCount += 1;
      } else {
        exceptionCount += result.exceptions.length;
      }

      recommendations.push({
        invoice_id: invoice.id,
        grant_rule_id: rule.id,
        package_id: claimPackage.id,
        eligibility_verdict: result.verdict,
        eligibility_source: "rule_engine",
        eligibility_confidence: result.confidence,
        eligibility_review_status: "unreviewed",
        rule_match_detail: result.detail,
      });

      exceptions.push(
        ...result.exceptions.map((exception) => ({
          invoice_id: invoice.id,
          package_id: claimPackage.id,
          exception_type: exception.type,
          description: exception.description,
          description_source: "rule_engine",
          description_confidence: result.confidence,
          description_review_status: "unreviewed",
        })),
      );
    }

    if (recommendations.length > 0) {
      const { error } = await supabase.from("claim_recommendations").insert(recommendations);
      if (error) throw error;
    }

    if (exceptions.length > 0) {
      const { error } = await supabase.from("exceptions").insert(exceptions);
      if (error) throw error;
    }

    const { error: updateError } = await supabase
      .from("claim_packages")
      .update({
        total_recommended: runningTotal,
        invoice_count: eligibleCount,
        exception_count: exceptionCount,
      })
      .eq("id", claimPackage.id);
    if (updateError) throw updateError;

    await supabase.from("audit_logs").insert({
      object_type: "claim_packages",
      object_id: claimPackage.id,
      action: "package_generated",
      before_state: null,
      after_state: {
        status: "pending_review",
        invoice_count: eligibleCount,
        exception_count: exceptionCount,
        total_recommended: runningTotal,
      },
    });

    return NextResponse.json({
      packageId: claimPackage.id,
      reportId: report.id,
      invoiceCount: eligibleCount,
      exceptionCount,
      totalRecommended: runningTotal,
    });
  } catch (error) {
    console.error("[ingest]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest actuals" },
      { status: 500 },
    );
  }
}
