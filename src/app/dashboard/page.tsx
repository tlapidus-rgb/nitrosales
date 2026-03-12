"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Summary {
  revenue: number;
  orders: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  sessions: number;
  adSpend: number;
  roas: number;
  conversionRate: number;
  avgTicket: number;
}

function formatARS(n: number) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setSummary(data.summary);
        else setError("Error cargando metricas");
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }, []);

  const kpis = summary
    ? [
        { label: "Facturacion", value: formatARS(summary.revenue), sub: "Ordenes facturadas" },
        { label: "Pedidos", value: summary.orders.toLocaleString("es-AR"), sub: "Facturados/enviados" },
        { label: "Ticket Promedio", value: formatARS(summary.avgTicket), sub: "Revenue / pedidos" },
        { label: "Sesiones", value: summary.sessions.toLocaleString("es-AR"), sub: "Trafico web (GA4)" },
        { label: "Inversion Ads", value: formatARS(summary.adSpend), sub: "Google + Meta" },
        { label: "ROAS", value: summary.roas + "x", sub: "Retorno publicitario" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">NitroSales</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{session?.user?.name || session?.user?.email}</span>
            <button onClick={() => signOut()} className="text-sm text-red-500 hover:text-red-700">Salir</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Dashboard</h2>
        <p className="text-gray-500 mb-6">Ultimos 30 dias &middot; El Mundo del Juguete</p>

        {loading ? (
          <p className="text-gray-400">Cargando metricas...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="bg-white rounded-xl shadow-sm p-4 border">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {summary && summary.cancelledOrders > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-8 text-sm text-amber-800">
                {summary.cancelledOrders} ordenes canceladas ({formatARS(summary.cancelledRevenue)}) excluidas del calculo de facturacion.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="font-semibold text-gray-700 mb-3">Conectores activos</h3>
                <div className="space-y-2">
                  {["VTEX - Ecommerce", "Google Analytics 4", "Google Ads", "Meta Ads"].map((c) => (
                    <div key={c} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-600">{c}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Conectado</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h3 className="font-semibold text-gray-700 mb-3">Bot de IA</h3>
                <p className="text-sm text-gray-500 mb-4">
                  El bot de IA analiza tus metricas y te da insights accionables.
                  Proximamente vas a poder chatear directamente desde aca.
                </p>
                <Link href="/chat" className="inline-block bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700">
                  Abrir Chat con IA
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
