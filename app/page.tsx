import { GrantApp } from "./grant-app";
import { loadAppData } from "@/lib/grants/data";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const params = await searchParams;
  const data = await loadAppData(params.package);
  return <GrantApp data={data} />;
}
