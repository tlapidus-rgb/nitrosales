// @ts-nocheck
"use client";

export default function CustomersPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
        <p className="text-gray-500">Analisis de clientes y retencion</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-12 text-center max-w-lg mx-auto">
        <div className="text-5xl mb-4">\uD83D\uDC65</div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Proximamente</h3>
        <p className="text-gray-500 mb-6">
          Estamos trabajando en el modulo de clientes. Pronto vas a poder ver:
        </p>
        <div className="text-left space-y-3 text-sm text-gray-600">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-xs font-bold">LTV</span>
            <span>Lifetime Value por cliente y segmento</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center text-xs font-bold">\u21BB</span>
            <span>Tasa de recompra y frecuencia</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center text-xs font-bold">\u2605</span>
            <span>Top clientes por facturacion</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center text-xs font-bold">RFM</span>
            <span>Segmentacion RFM automatica</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center text-xs font-bold">\u26A0</span>
            <span>Alertas de churn y clientes en riesgo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
