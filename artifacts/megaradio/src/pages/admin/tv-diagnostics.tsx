import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
type Row = {
  day: string;
  platform: string;
  appVersion: string;
  bundleVersion: string;
  event: string;
  code: string;
  route: string;
  module: string;
  line: number;
  column: number;
  count: number;
};
export default function TvDiagnostics() {
  const [platform, setPlatform] = useState(""),
    [days, setDays] = useState("7");
  const query = useQuery<{
    rows: Row[];
    ga4: { configured: boolean; payloadValidated: boolean };
  }>({
    queryKey: ["tv-diagnostics", platform, days],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ days });
      if (platform) params.set("platform", platform);
      const response = await apiRequest(
        "GET",
        `/api/admin/tv-diagnostics?${params}`,
        { signal },
      );
      if (!response.ok) throw new Error("Unable to load TV diagnostics");
      return response.json();
    },
    staleTime: 30000,
  });
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Samsung / LG TV diagnostics</h1>
      <p>
        Opt-in event counts, retained for 30 days. These are not unique users,
        native crash-free rates or ANRs. Disabled reporting and offline TVs are
        not measured.
      </p>
      <p>
        Optional GA4 relay:{" "}
        {query.data?.ga4?.configured
          ? query.data.ga4.payloadValidated
            ? "configured; payload validated; delivery is not guaranteed"
            : "configured; payload validation pending"
          : "not configured; first-party reports remain available"}
      </p>
      <div className="flex gap-4 items-center">
        <label>
          Platform{" "}
          <select
            className="border p-2 rounded"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">All TVs</option>
            <option value="tizen">Samsung Tizen</option>
            <option value="webos">LG webOS</option>
          </select>
        </label>
        <label>
          Period{" "}
          <select
            className="border p-2 rounded"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="1">Today</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <Button onClick={() => void query.refetch()}>Refresh</Button>
      </div>
      {query.isLoading ? (
        <p>Loading TV diagnostics…</p>
      ) : query.isError ? (
        <p role="alert">
          TV diagnostics could not be loaded. Refresh to retry.
        </p>
      ) : !query.data?.rows.length ? (
        <p>
          No opted-in reports received in this period. This does not prove that
          TVs have no errors.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Day",
                  "Platform",
                  "Package",
                  "Bundle",
                  "Event",
                  "Code",
                  "Screen",
                  "Source location",
                  "Count",
                ].map((h) => (
                  <th className="p-2 text-left" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r, i) => (
                <tr className="border-t" key={i}>
                  <td className="p-2">{r.day}</td>
                  <td>{r.platform}</td>
                  <td>{r.appVersion}</td>
                  <td className="break-all max-w-48">{r.bundleVersion}</td>
                  <td>{r.event}</td>
                  <td>{r.code}</td>
                  <td>{r.route}</td>
                  <td>
                    {r.module}
                    {r.line ? `:${r.line}:${r.column}` : ""}
                  </td>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3">
            Up to 2,000 aggregate groups shown. Repeated identical reports are
            coalesced per minute; abusive traffic is limited.
          </p>
        </div>
      )}
    </main>
  );
}
