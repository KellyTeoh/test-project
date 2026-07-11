import { createGrantDbClient } from "@/lib/grants/supabase";

export const dynamic = "force-dynamic";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createGrantDbClient();

  const { data: pkg, error: packageError } = await supabase
    .from("claim_packages")
    .select("*")
    .eq("id", id)
    .single();
  if (packageError) {
    return new Response(packageError.message, { status: 500 });
  }

  if (pkg.status !== "approved") {
    return new Response("Package must be approved before export.", { status: 409 });
  }

  const { data: recommendations, error: recommendationError } = await supabase
    .from("claim_recommendations")
    .select("*")
    .eq("package_id", id)
    .eq("eligibility_verdict", "eligible");
  if (recommendationError) {
    return new Response(recommendationError.message, { status: 500 });
  }

  const invoiceIds = (recommendations ?? []).map((rec) => rec.invoice_id);
  const { data: invoices, error: invoiceError } =
    invoiceIds.length > 0
      ? await supabase.from("invoices").select("*").in("id", invoiceIds)
      : { data: [], error: null };
  if (invoiceError) {
    return new Response(invoiceError.message, { status: 500 });
  }

  const rows = [
    [
      "package_name",
      "invoice_number",
      "vendor_name",
      "amount",
      "transaction_date",
      "cost_center",
      "program_code",
      "verdict",
    ],
    ...(invoices ?? []).map((invoice) => [
      pkg.package_name,
      invoice.invoice_number,
      invoice.vendor_name,
      invoice.total_amount,
      invoice.transaction_date,
      invoice.cost_center,
      invoice.program_code,
      "eligible",
    ]),
  ];

  return new Response(rows.map((row) => row.map(csvEscape).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${pkg.package_name.replaceAll(" ", "_")}.csv"`,
    },
  });
}
