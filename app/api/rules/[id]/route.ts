import { createGrantDbClient } from "@/lib/grants/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { is_active?: boolean };
    const supabase = createGrantDbClient();

    const { data, error } = await supabase
      .from("grant_rules")
      .update({ is_active: Boolean(body.is_active) })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error("[rules/:id]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update grant rule" },
      { status: 500 },
    );
  }
}
