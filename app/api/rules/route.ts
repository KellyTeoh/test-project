import { createGrantDbClient } from "@/lib/grants/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function splitList(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = createGrantDbClient();

    const payload = {
      grant_name: String(body.grant_name ?? "").trim(),
      allowed_cost_centers: splitList(body.allowed_cost_centers).map((item) =>
        item.toUpperCase(),
      ),
      allowed_programs: splitList(body.allowed_programs).map((item) => item.toUpperCase()),
      allowed_categories: splitList(body.allowed_categories).map((item) =>
        item.toLowerCase(),
      ),
      start_date: String(body.start_date ?? ""),
      end_date: String(body.end_date ?? ""),
      claim_cap: Number(body.claim_cap),
      is_active: body.is_active !== false,
    };

    if (
      !payload.grant_name ||
      payload.allowed_cost_centers.length === 0 ||
      payload.allowed_programs.length === 0 ||
      payload.allowed_categories.length === 0 ||
      !payload.start_date ||
      !payload.end_date ||
      Number.isNaN(payload.claim_cap)
    ) {
      return NextResponse.json({ error: "All rule fields are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("grant_rules")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error("[rules]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save grant rule" },
      { status: 500 },
    );
  }
}
