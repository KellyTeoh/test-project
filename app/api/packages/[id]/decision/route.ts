import { createGrantDbClient } from "@/lib/grants/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      decision?: "approved" | "returned" | "rejected";
      comment?: string;
    };

    if (!body.decision || !["approved", "returned", "rejected"].includes(body.decision)) {
      return NextResponse.json({ error: "Choose approve, return, or reject." }, { status: 400 });
    }

    if (!body.comment?.trim()) {
      return NextResponse.json({ error: "Comment is required." }, { status: 400 });
    }

    const supabase = createGrantDbClient();
    const { data: before, error: beforeError } = await supabase
      .from("claim_packages")
      .select("*")
      .eq("id", id)
      .single();
    if (beforeError) throw beforeError;

    const nextStatus = body.decision === "approved" ? "approved" : "returned";

    const { error: decisionError } = await supabase.from("approval_decisions").insert({
      package_id: id,
      decision: body.decision,
      comment: body.comment.trim(),
    });
    if (decisionError) throw decisionError;

    const { data: after, error: updateError } = await supabase
      .from("claim_packages")
      .update({ status: nextStatus })
      .eq("id", id)
      .select()
      .single();
    if (updateError) throw updateError;

    const { error: auditError } = await supabase.from("audit_logs").insert({
      object_type: "claim_packages",
      object_id: id,
      action: nextStatus === "approved" ? "package_approved" : "package_returned",
      before_state: before,
      after_state: after,
    });
    if (auditError) throw auditError;

    return NextResponse.json({ package: after });
  } catch (error) {
    console.error("[decision]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit decision" },
      { status: 500 },
    );
  }
}
