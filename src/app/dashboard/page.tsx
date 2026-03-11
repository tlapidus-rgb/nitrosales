"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Summary = {
  revenue: number;
  orders: number;
  sessions: number;
  adSpend: number;
  roas: number;
  conversionRate: number;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("es-AR").format(n);
}

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-gray-700 transition">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-2">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setSummary(data.summary);
        else setError("No se pudieron cargar las metricas");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexion");
        setLoading(false);
      });
  }, []);

  const s = summary || { revenue: 0, orders: 0, sessions: 0, adSpend: 0, roas: 0, conversionRate: 0 };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            NitroSales
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{session?.user?.name || session?.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-500 hover:text-white transition"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1">Dashboard</h2>
          <p className="text-gray-400">Ultimos 30 dias &middot; El Mundo del Juguete</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Cargando metricas...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
              <KPICard label="Facturacion" value={formatMoney(s.revenue)} sub="Ventas totales" color="text-green-400" />
              <KPICard label="Pedidos" value={formatNumber(s.orders)} sub="Ordenes completadas" color="text-blue-400" />
              <KPICard label="Sesiones" value={formatNumber(s.sessions)} sub="Trafico web (GA4)" color="text-yellow-400" />
              <KPICard label="Inversion Ads" value={formatMoney(s.adSpend)} sub="Google + Meta" color="text-red-400" />
              <KPICard label="ROAS" value={s.roas.toFixed(2) + "x"} sub="Retorno publicitario" color="text-purple-400" />
              <KPICard label="Conversion" value={s.conversionRate.toFixed(2) + "%"} sub="Sesiones a ventas" color="text-cyan-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold mb-4">Conectores activos</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      <span>VTEX - Ecommerce</span>
                    </div>
                    <span className="text-xs text-green-400">Conectado</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      <span>Google Analytics 4</span>
                    </div>
                    <span className="text-xs text-green-400">Conectado</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      <span>Google Ads</span>
                    </div>
                    <span className="text-xs text-green-400">Conectado</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      <span>Meta Ads</span>
                    </div>
                    <span className="text-xs text-green-400">Conectado</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold mb-4">Bot de IA</h3>
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <p className="text-gray-300 text-sm">
                    El bot de IA analiza tus metricas y te da insights accionables.
                    Proximamente vas a poder chatear directamente desde aca.
                  </p>
                </div>
                <a
                  href="/chat"
                  className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition"
                >
                  Abrir Chat con IA
                </a>
              </div>
            </div>

            {s.orders === 0 && s.sessions === 0 && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-bold mb-2">Sin datos todavia</h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Los conectores estan configurados. Cuando se ejecute la primera sincronizacion
                  de datos, vas a ver las metricas en tiempo real aca.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
