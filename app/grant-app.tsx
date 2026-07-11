"use client";

import type { AppData } from "@/lib/grants/data";
import { useMemo, useState, useTransition } from "react";

const HEADERS = "invoice_number,vendor_name,cost_center,program_code,spend_category,amount,transaction_date".split(",");
const SAMPLE = `invoice_number,vendor_name,cost_center,program_code,spend_category,amount,transaction_date
INV-20240318-001,Apex Environmental Ltd,CC-1042,PROG-ENV-01,equipment,12400,2024-03-18
INV-20240318-002,Greenfield Consulting,CC-1043,PROG-ENV-02,consulting,8750,2024-03-18
INV-20240318-003,Metro Civil Works,CC-2010,PROG-INFRA-01,equipment,31200,2024-03-18
INV-20240318-004,Unknown Vendor Co,CC-9999,PROG-UNKNOWN,consulting,5400,2024-03-18
INV-20240318-005,BlueSky Travel Agency,CC-1099,PROG-ENV-02,travel,3200,2024-03-18
INV-20240318-002,Greenfield Consulting,CC-1043,PROG-ENV-02,consulting,8750,2024-03-18`;

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));

function csv(text: string) {
  const [first, ...lines] = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = first.split(",").map((h) => h.trim());
  if (HEADERS.some((h) => !headers.includes(h))) throw new Error("File format not recognised. Expected columns: " + HEADERS.join(", "));
  return lines.map((line) => Object.fromEntries(headers.map((h, i) => [h, line.split(",")[i]?.trim() ?? ""])));
}

export function GrantApp({ data }: { data: AppData }) {
  const [id, setId] = useState(data.selectedPackage?.id ?? "");
  const [msg, setMsg] = useState(data.error ?? "");
  const [comment, setComment] = useState("");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const pkg = data.packages.find((p) => p.id === id) ?? data.selectedPackage;
  const invoice = useMemo(() => new Map(data.invoices.map((i) => [i.id, i])), [data.invoices]);
  const eligible = data.recommendations.filter((r) => r.eligibility_verdict === "eligible").map((r) => [r, invoice.get(r.invoice_id)] as const).filter(([, i]) => i);
  const exceptions = data.exceptions.map((e) => [e, invoice.get(e.invoice_id)] as const).filter(([, i]) => i);
  const txs = data.transactions.filter((t) => Object.values(t).join(" ").toLowerCase().includes(q.toLowerCase()));
  const go = (next = pkg?.id) => (window.location.href = next ? `/?package=${next}` : "/");

  async function ingest(file: File | null) {
    try {
      setMsg("");
      const rows = csv(file ? await file.text() : SAMPLE);
      start(async () => {
        const res = await fetch("/api/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file?.name ?? "sample_actuals.csv", rows }) });
        const body = await res.json();
        res.ok ? go(body.packageId) : setMsg(body.error);
      });
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to parse CSV.");
    }
  }

  function decide(decision: "approved" | "returned") {
    if (!pkg) return;
    start(async () => {
      const res = await fetch(`/api/packages/${pkg.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, comment }) });
      const body = await res.json();
      res.ok ? go(pkg.id) : setMsg(body.error);
    });
  }

  function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start(async () => {
      const res = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      const body = await res.json();
      res.ok ? go() : setMsg(body.error);
    });
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] p-5 text-neutral-950">
      <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div><p className="text-sm font-semibold uppercase text-sky-700">Grant claim review</p><h1 className="text-3xl font-semibold">Actuals to approved claim package</h1></div>
        <label className="cursor-pointer rounded bg-neutral-950 px-4 py-2 text-sm font-semibold text-white">Upload Actuals<input className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => ingest(e.target.files?.[0] ?? null)} /></label>
        <button className="rounded border px-4 py-2 text-sm font-semibold" onClick={() => ingest(null)}>Process Sample CSV</button>
      </header>
      <div className="mx-auto mt-5 grid max-w-7xl gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <Box title="Claim Packages">{data.packages.length === 0 && <p>No packages yet. Upload an actuals report to begin.</p>}{data.packages.map((p) => <button className="mb-2 w-full border p-3 text-left text-sm" key={p.id} onClick={() => setId(p.id)}><b>{p.package_name}</b><br />{p.status} · {p.invoice_count} eligible · {p.exception_count} exceptions · {money(p.total_recommended)}</button>)}</Box>
          <Box title="Grant Rules">{data.rules.map((r) => <p className="mb-2 border p-3 text-sm" key={r.id}><b>{r.grant_name}</b><br />{r.allowed_cost_centers.join(", ")} · {money(r.claim_cap)}</p>)}<form className="grid gap-2 text-sm" onSubmit={saveRule}>{["grant_name","allowed_cost_centers","allowed_programs","allowed_categories"].map((n) => <input className="border px-3 py-2" key={n} name={n} placeholder={n.replaceAll("_", " ")} />)}<input className="border px-3 py-2" name="start_date" type="date" /><input className="border px-3 py-2" name="end_date" type="date" /><input className="border px-3 py-2" name="claim_cap" placeholder="claim cap" type="number" /><button className="rounded bg-neutral-950 px-3 py-2 font-semibold text-white" disabled={pending}>Save Rule</button></form></Box>
        </aside>
        <section className="space-y-4">
          {msg && <div className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{msg}</div>}
          {!data.configured && <div className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Supabase env is not loaded yet. Pull .env.local to use the provisioned tables.</div>}
          {pkg && <Box title={pkg.package_name}><p>{pkg.status} · {pkg.invoice_count} eligible · {pkg.exception_count} exceptions · {money(pkg.total_recommended)}</p><a className={`mt-3 inline-block rounded px-3 py-2 text-sm font-semibold ${pkg.status === "approved" ? "bg-emerald-700 text-white" : "pointer-events-none bg-neutral-200 text-neutral-500"}`} href={`/api/packages/${pkg.id}/export`}>Export CSV</a></Box>}
          <div className="grid gap-4 xl:grid-cols-2">
            <Box title="Eligible Invoices"><Rows empty="No eligible invoices." rows={eligible.map(([r, i]) => [i!.invoice_number, i!.vendor_name, money(i!.total_amount), `${Math.round(r.eligibility_confidence * 100)}%`])} /></Box>
            <Box title="Exceptions">{exceptions.length === 0 && <p>No exceptions flagged for this package.</p>}{exceptions.map(([e, i]) => <details className="mb-2 border p-3 text-sm" key={e.id}><summary>{e.exception_type} · {i!.invoice_number}</summary><p>{e.description}</p></details>)}</Box>
          </div>
          {pkg && <Box title="Approval Decision"><textarea className="min-h-24 w-full border p-3 text-sm" onChange={(e) => setComment(e.target.value)} placeholder="Reviewer comment" value={comment} /><div className="mt-3 flex gap-2"><button className="rounded bg-emerald-700 px-4 py-2 text-white" disabled={pending} onClick={() => decide("approved")}>Approve Package</button><button className="rounded border px-4 py-2" disabled={pending} onClick={() => decide("returned")}>Return With Comment</button></div>{data.approvals.map((a) => <p className="mt-3 border p-3 text-sm" key={a.id}><b>{a.decision}</b> · {a.comment}</p>)}</Box>}
          <div className="grid gap-4 xl:grid-cols-2">
            <Box title="Transactions"><input className="mb-3 border px-3 py-2 text-sm" onChange={(e) => setQ(e.target.value)} placeholder="Search" value={q} /><Rows empty="No transactions loaded." rows={txs.map((t) => [t.invoice_number, t.vendor_name, t.cost_center, t.program_code, money(t.amount)])} /></Box>
            <Box title="Audit Trail">{data.auditLogs.length === 0 && <p>No audit events yet.</p>}{data.auditLogs.map((l) => <p className="mb-2 border-l-2 border-neutral-950 pl-3 text-sm" key={l.id}><b>{l.action.replaceAll("_", " ")}</b><br />{new Date(l.created_at).toLocaleString()}</p>)}</Box>
          </div>
        </section>
      </div>
    </main>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border border-neutral-200 bg-white p-4"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>;
}

function Rows({ rows, empty }: { rows: Array<Array<React.ReactNode>>; empty: string }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><tbody>{rows.length ? rows.map((r, i) => <tr className="border-b" key={i}>{r.map((c, j) => <td className="py-2 pr-3" key={j}>{c}</td>)}</tr>) : <tr><td className="py-4 text-neutral-500">{empty}</td></tr>}</tbody></table></div>;
}
