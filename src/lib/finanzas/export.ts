/* ══════════════════════════════════════════════
   FINANZAS · EXPORT (Excel + PDF)
   Fase 2e — exportacion del P&L Estado de Resultados.

   Excel: server-less via exceljs (dynamic import, tree-shakeable).
   PDF  : no requiere esta lib — se dispara con window.print() + CSS @media print.

   Diseño:
   - Todos los valores ya convertidos a la moneda actual (USD / ARS / ARS_ADJ)
     llegan como "value" numerico + "display" string formateado.
   - Esto evita re-hacer la conversion en el lib y garantiza que lo
     exportado coincide byte-a-byte con lo que el usuario ve en pantalla.
   ══════════════════════════════════════════════ */

export type ExportRow = {
  label: string;
  value: number;                       // valor ya convertido en la moneda del view
  display: string;                     // valor ya formateado
  pct?: number;                        // % del revenue
  bold?: boolean;
  highlight?: boolean;
  indent?: boolean;
  behavior?: "VARIABLE" | "FIJO" | "SEMIFIJO" | null;
  color?: "blue" | "green" | "rose" | "gray" | "violet";
};

export type ExportManualCost = {
  category: string;
  total: number;
  display: string;
  behavior: "VARIABLE" | "FIJO" | "SEMIFIJO" | null;
};

export type ExportComposition = {
  variableTotal: number;
  variableDisplay: string;
  variablePct: number;
  fixedTotal: number;
  fixedDisplay: string;
  fixedPct: number;
  semiFixedTotal: number;
  semiFixedDisplay: string;
  semiFixedPct: number;
};

export type ExportPayload = {
  rangeLabel: string;                  // ej: "01 Mar 2026 → 31 Mar 2026"
  currencyLabel: string;               // ej: "USD" | "ARS" | "ARS ajustado por IPC"
  generatedAtLabel: string;            // ej: "18/04/2026 14:32"
  rows: ExportRow[];                   // filas del P&L
  manualCosts: ExportManualCost[];     // detalle de costos manuales (vacio ok)
  composition: ExportComposition;     // variables/fijos/semi-fijos
};

/* ──────────────────────────────────────────────
   Helper: disparar descarga de un Blob
   ────────────────────────────────────────────── */

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberar el object URL despues de que el browser haga el click.
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* ──────────────────────────────────────────────
   Excel export via exceljs
   ────────────────────────────────────────────── */

export async function exportPnLToExcel(payload: ExportPayload, fileName?: string) {
  // Dynamic import — evita bundlear exceljs en la pagina.
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "NitroSales";
  wb.created = new Date();
  wb.modified = new Date();

  /* ─── Sheet 1: P&L ─── */
  const pnl = wb.addWorksheet("P&L", {
    views: [{ state: "frozen", ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });

  pnl.columns = [
    { header: "", key: "label", width: 50 },
    { header: "Valor", key: "value", width: 18 },
    { header: "% Revenue", key: "pct", width: 12 },
    { header: "Comportamiento", key: "behavior", width: 16 },
  ];

  // Encabezado: titulo y metadata
  pnl.mergeCells("A1:D1");
  const titleCell = pnl.getCell("A1");
  titleCell.value = "Estado de Resultados — NitroSales";
  titleCell.font = { name: "Inter", size: 16, bold: true, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  pnl.getRow(1).height = 26;

  pnl.mergeCells("A2:D2");
  const metaCell = pnl.getCell("A2");
  metaCell.value = `${payload.rangeLabel}  ·  Moneda: ${payload.currencyLabel}  ·  Generado: ${payload.generatedAtLabel}`;
  metaCell.font = { name: "Inter", size: 10, color: { argb: "FF64748B" } };
  metaCell.alignment = { vertical: "middle", horizontal: "left" };

  // Header row en 4 (por los frozen panes).
  const headerRow = pnl.getRow(4);
  headerRow.values = ["", "Valor", "% Revenue", "Comportamiento"];
  headerRow.font = { name: "Inter", size: 10, bold: true, color: { argb: "FF475569" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.eachCell((cell, col) => {
    if (col > 1) cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
  });

  // Filas del P&L — empezar en fila 5.
  payload.rows.forEach((row) => {
    const excelRow = pnl.addRow({
      label: `${row.indent ? "   " : ""}${row.label}`,
      value: row.value,
      pct: typeof row.pct === "number" ? row.pct / 100 : null,
      behavior: row.behavior ?? "",
    });

    // Formato numerico.
    excelRow.getCell("value").numFmt = '#,##0.00;-#,##0.00';
    excelRow.getCell("value").alignment = { horizontal: "right" };
    excelRow.getCell("pct").numFmt = "0.0%";
    excelRow.getCell("pct").alignment = { horizontal: "right" };
    excelRow.getCell("behavior").alignment = { horizontal: "right" };

    // Estilos por tipo de fila.
    if (row.bold) {
      excelRow.font = { name: "Inter", size: 11, bold: true, color: { argb: "FF0F172A" } };
    } else {
      excelRow.font = { name: "Inter", size: 10, color: { argb: "FF475569" } };
    }

    if (row.highlight) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }

    // Color por semantica.
    const valueCell = excelRow.getCell("value");
    if (row.value < 0) {
      valueCell.font = { name: "Inter", size: row.bold ? 11 : 10, bold: row.bold, color: { argb: "FFBE123C" } };
    } else if (row.color === "green") {
      valueCell.font = { name: "Inter", size: row.bold ? 11 : 10, bold: row.bold, color: { argb: "FF059669" } };
    } else if (row.color === "blue") {
      valueCell.font = { name: "Inter", size: row.bold ? 11 : 10, bold: row.bold, color: { argb: "FF2563EB" } };
    } else if (row.color === "violet") {
      valueCell.font = { name: "Inter", size: row.bold ? 11 : 10, bold: row.bold, color: { argb: "FF7C3AED" } };
    } else if (row.color === "rose") {
      valueCell.font = { name: "Inter", size: row.bold ? 11 : 10, bold: row.bold, color: { argb: "FFBE123C" } };
    }
  });

  /* ─── Sheet 2: Composicion ─── */
  const comp = wb.addWorksheet("Composición", { properties: { defaultRowHeight: 20 } });
  comp.columns = [
    { header: "Tipo", key: "type", width: 22 },
    { header: "Total", key: "total", width: 18 },
    { header: "% Ops", key: "pct", width: 12 },
  ];
  comp.getRow(1).font = { name: "Inter", size: 11, bold: true, color: { argb: "FF475569" } };
  comp.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
  });

  const compRows: { type: string; total: number; pct: number; color: string }[] = [
    { type: "Variables", total: payload.composition.variableTotal, pct: payload.composition.variablePct, color: "FF0891B2" },
    { type: "Fijos", total: payload.composition.fixedTotal, pct: payload.composition.fixedPct, color: "FF7C3AED" },
    { type: "Semi-fijos", total: payload.composition.semiFixedTotal, pct: payload.composition.semiFixedPct, color: "FFD97706" },
  ];

  compRows.forEach((r) => {
    const xr = comp.addRow({ type: r.type, total: r.total, pct: r.pct / 100 });
    xr.font = { name: "Inter", size: 10, color: { argb: "FF0F172A" } };
    xr.getCell("type").font = { name: "Inter", size: 10, bold: true, color: { argb: r.color } };
    xr.getCell("total").numFmt = '#,##0.00;-#,##0.00';
    xr.getCell("total").alignment = { horizontal: "right" };
    xr.getCell("pct").numFmt = "0.0%";
    xr.getCell("pct").alignment = { horizontal: "right" };
  });

  /* ─── Sheet 3: Costos manuales (solo si hay) ─── */
  if (payload.manualCosts.length > 0) {
    const man = wb.addWorksheet("Costos manuales", { properties: { defaultRowHeight: 18 } });
    man.columns = [
      { header: "Categoría", key: "category", width: 28 },
      { header: "Total", key: "total", width: 18 },
      { header: "Comportamiento", key: "behavior", width: 16 },
    ];
    man.getRow(1).font = { name: "Inter", size: 11, bold: true, color: { argb: "FF475569" } };
    man.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
    });

    payload.manualCosts.forEach((mc) => {
      const xr = man.addRow({ category: mc.category, total: mc.total, behavior: mc.behavior ?? "" });
      xr.font = { name: "Inter", size: 10, color: { argb: "FF0F172A" } };
      xr.getCell("total").numFmt = '#,##0.00;-#,##0.00';
      xr.getCell("total").alignment = { horizontal: "right" };
      xr.getCell("behavior").alignment = { horizontal: "right" };
    });
  }

  // Buffer → Blob → download.
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const finalName = fileName ?? `NitroSales_PnL_${new Date().toISOString().split("T")[0]}.xlsx`;
  triggerBlobDownload(blob, finalName);
}
