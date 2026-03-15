// @ts-nocheck

"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "A/components/NitroInsightsPanel";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Package,
  Zap,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   INTERFACES — match API v3 response shape exactly
   ═══════════════════════════════════════════════════════════ */

interface WeeklyDataPoint {
  weekStart: string;
  units: number;
  revenue: number;
  orders: number;
}

interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  stock: number | null;
  unitsSold: number;
  revenue: number;
  orders: number;
  avgPrice: number;
  trendData: {
    weeklyData: WeeklyDataPoint[];
    wowUnitsPct: number;
    wowRevenuePct: number;
    currentWeekUnits: number;
    prevWeekUnits: number;
    currentWeekRevenue: number;
    prevWeekRevenue: number;
  };
  stockData: {
    dailySalesRate: number;
    daysOfStock: number | null;
    stockoutDate: string | null;
    stockHealth: "critical" | "low" | "optimal" | "excessive" | "no_data";
    isDead: boolean;
    daysSinceLastSale: number | null;
    abcClass: "A" | "B" | "C";
  };
}

interface CategoryWeeklyTrend {
  category: string;
  weeks: Array<{ weekStart: string; units: number; revenue: number }>;
}

interface BrandWeeklyTrend {
  brand: string;
  weeks: Array<{ weekStart: string; units: number; revenue: number }>;
}

interface ApiResponse {
  products: ProductItem[];
  brands: string[];
  categories: string[];
  stockSyncedAt: string | null;
  totalActiveProducts: number;
  summary: {
    estimatedTotalUnits: number;
    estimatedTotalRevenue: number;
    totalOrders: number;
    detailedUnits: number;
    detailedRevenue: number;
    uniqueProducts: number;
    paretoConcentration: number;
    ordersWithItems: number;
    processedPct: number;
    isComplete: boolean;
  };
  allWeeks: string[];
  categoryWeeklyTrend: CategoryWeeklyTrend[];
  brandWeeklyTrend: BrandWeeklyTrend[];
  stockHealthSummary: {
    critical: number;
    low: number;
    optimal: number;
    excessive: number;
    noData: number;
    dead: number;
  };
  abcSummary: { A: number; B: number; C: number };
  trendSummary: { growing: number; declining: number; stable: number };
  totalInventoryUnits: number;
  totalInventoryValue: number;
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#94a3b8",
];
  "File 2 part 0 loaded successfully