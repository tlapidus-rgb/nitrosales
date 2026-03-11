export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            NitroSales
          </h1>
          <span className="text-sm text-gray-400">v0.1.0</span>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Bienvenido a NitroSales</h2>
          <p className="text-gray-400 text-lg">Inteligencia para vender mas</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-sm text-gray-400 mb-1">Ecommerce</div>
            <div className="text-2xl font-bold text-green-400">VTEX</div>
            <div className="text-xs text-gray-500 mt-2">Conectado</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-sm text-gray-400 mb-1">Analytics</div>
            <div className="text-2xl font-bold text-yellow-400">GA4</div>
            <div className="text-xs text-gray-500 mt-2">Conectado</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-sm text-gray-400 mb-1">Ads</div>
            <div className="text-2xl font-bold text-blue-400">Google + Meta</div>
            <div className="text-xs text-gray-500 mt-2">Conectado</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-sm text-gray-400 mb-1">IA Bot</div>
            <div className="text-2xl font-bold text-purple-400">Claude</div>
            <div className="text-xs text-gray-500 mt-2">Activo</div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
          <p className="text-gray-300 text-lg">El dashboard completo esta en desarrollo.</p>
          <p className="text-gray-500 mt-2">Pronto vas a ver metricas en tiempo real, insights de IA y mucho mas.</p>
        </div>
      </main>
    </div>
  );
}
