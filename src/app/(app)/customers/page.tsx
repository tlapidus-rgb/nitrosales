'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Users,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
} from 'lucide-react';
import { formatARS, formatCompact } from '@/lib/utils/format';

const COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#f97316',
  '#14b8a6',
  '#ec4899',
  '#94a3b8',
];

const TIPO_COLORS = {
  VIP: '#f59e0b',
  Recurrente: '#6366f1',
  Nuevo: '#10b981',
};

const QUICK_RANGES = [
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
  { label: '12 meses', days: 365 },
  { label: 'Todo', days: 730 },
];

interface Customer {
  id: string;
  nombre: string;
  email: string;
  ciudad: string;
  ordenes: number;
  totalGastado: number;
  ticketPromedio: number;
  ultimaCompra: string;
  tipo: 'Nuevo' | 'Recurrente' | 'VIP';
}

interface MetricsResponse {
  clientesUnicos: number;
  clientesUnicosAnterior: number;
  tasaRecompra: number;
  ticketPromedio: number;
  clientesNuevos: number;
  typeDistribution: Array<{ name: string; value: number }>;
  frequencyDistribution: Array<{ name: string; value: number }>;
  topCities: Array<{
    ciudad: string;
    clientes: number;
    facturacion: number;
  }>;
  customers: Customer[];
  totalPages: number;
  currentPage: number;
}

function ChangeBadge({ value, isPositive }: { value: number; isPositive: boolean }) {
  if (value === 0) return null;
  const sign = isPositive ? '+' : '';
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  const color = isPositive ? 'text-emerald-600' : 'text-red-600';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {sign}
      {value}%
    </span>
  );
}

export default function CustomersPage() {
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [activeQuickRange, setActiveQuickRange] = useState(365);
  const [source, setSource] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const fromStr = dateFrom.toISOString().split('T')[0];
        const toStr = dateTo.toISOString().split('T')[0];
        const response = await fetch(
          `/api/metrics/customers?from=${fromStr}&to=${toStr}&page=${currentPage}&source=${source}`
        );
        if (!response.ok) throw new Error('Error al cargar datos');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dateFrom, dateTo, source, currentPage]);

  const handleQuickRange = (days: number) => {
    setActiveQuickRange(days);
    const newFrom = new Date();
    newFrom.setDate(newFrom.getDate() - days);
    setDateFrom(newFrom);
    setDateTo(new Date());
    setCurrentPage(1);
  };

  const filteredCustomers = useMemo(() => {
    if (!data?.customers) return [];
    const term = searchTerm.toLowerCase();
    return data.customers.filter(
      (c) =>
        c.nombre.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
    );
  }, [data?.customers, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Cargando clientes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-600 mt-2">Análisis de clientes y comportamiento de compra</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
          {/* Source Filter */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Fuente</p>
            <div className="flex gap-2">
              {['ALL', 'VTEX', 'MELI'].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSource(s);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    source === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {s === 'ALL' ? 'Todos' : s}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Range Buttons */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Período</p>
            <div className="flex gap-2">
              {QUICK_RANGES.map((range) => (
                <button
                  key={range.days}
                  onClick={() => handleQuickRange(range.days)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeQuickRange === range.days
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Desde
              </label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={dateFrom.toISOString().split('T')[0]}
                  onChange={(e) => {
                    setDateFrom(new Date(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-transparent border-0 outline-none text-sm flex-1"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hasta
              </label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={dateTo.toISOString().split('T')[0]}
                  onChange={(e) => {
                    setDateTo(new Date(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-transparent border-0 outline-none text-sm flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {/* Clientes Únicos */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
              Clientes únicos
            </p>
            <p className="text-2xl font-bold text-gray-900 mb-2">
              {formatCompact(data?.clientesUnicos || 0)}
            </p>
            <ChangeBadge
              value={data?.clientesUnicosAnterior || 0}
              isPositive={true}
            />
          </div>

          {/* Tasa de Recompra */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
              Tasa de recompra
            </p>
            <p className="text-2xl font-bold text-gray-900 mb-2">
              {(data?.tasaRecompra || 0).toFixed(1)}%
            </p>
          </div>

          {/* Ticket Promedio */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
              Ticket promedio/cliente
            </p>
            <p className="text-2xl font-bold text-gray-900 mb-2">
              {formatARS(data?.ticketPromedio || 0)}
            </p>
          </div>

          {/* Clientes Nuevos */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
              Clientes nuevos
            </p>
            <p className="text-2xl font-bold text-gray-900 mb-2">
              {formatCompact(data?.clientesNuevos || 0)}
            </p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Tipo Distribution */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Distribución por tipo
            </h3>
            {data?.typeDistribution && data.typeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.typeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.typeDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          TIPO_COLORS[entry.name as keyof typeof TIPO_COLORS] ||
                          COLORS[index % COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500">No hay datos disponibles</p>
            )}
          </div>

          {/* Frequency Distribution */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Distribución por frecuencia
            </h3>
            {data?.frequencyDistribution && data.frequencyDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.frequencyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500">No hay datos disponibles</p>
            )}
          </div>
        </div>

        {/* Top Cities */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            Principales ciudades
          </h3>
          <div className="space-y-6">
            {data?.topCities && data.topCities.length > 0 ? (
              data.topCities.map((city, idx) => {
                const maxClientes = Math.max(
                  ...data.topCities.map((c) => c.clientes)
                );
                const percentage = (city.clientes / maxClientes) * 100;
                return (
                  <div key={idx}>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {city.ciudad}
                      </span>
                      <span className="text-xs text-gray-600">
                        {city.clientes} clientes • {formatARS(city.facturacion)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500">No hay datos disponibles</p>
            )}
          </div>
        </div>

        {/* Customers Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="mb-6">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-0 outline-none text-sm flex-1"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Nombre
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Ciudad
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">
                    Órdenes
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Total gastado
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Ticket prom.
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Última compra
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">
                    Tipo
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900">{customer.nombre}</td>
                      <td className="py-3 px-4 text-gray-600">{customer.email}</td>
                      <td className="py-3 px-4 text-gray-600">{customer.ciudad}</td>
                      <td className="py-3 px-4 text-center text-gray-900">
                        {customer.ordenes}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {formatARS(customer.totalGastado)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {formatARS(customer.ticketPromedio)}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {new Date(customer.ultimaCompra).toLocaleDateString(
                          'es-AR'
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            customer.tipo === 'Nuevo'
                              ? 'bg-emerald-50 text-emerald-700'
                              : customer.tipo === 'Recurrente'
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {customer.tipo}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No se encontraron clientes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Página {data?.currentPage || 1} de {data?.totalPages || 1}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                Anterior
              </button>
              <button
                onClick={() =>
                  setCurrentPage(Math.min(data?.totalPages || 1, currentPage + 1))
                }
                disabled={currentPage === (data?.totalPages || 1)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  currentPage === (data?.totalPages || 1)
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}