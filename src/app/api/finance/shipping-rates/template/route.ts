import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/shipping-rates/template?carrier=X&service=Y
 *
 * Generates a simplified Excel template for a specific carrier + service.
 * The Excel only has: CP Desde, CP Hasta, Costo ($).
 * Carrier and service are passed as query params and NOT included in the Excel,
 * eliminating human error from manual text entry.
 */
export async function GET(req: NextRequest) {
  try {
    const carrier = req.nextUrl.searchParams.get("carrier") || "";
    const service = req.nextUrl.searchParams.get("service") || "";

    const workbook = new ExcelJS.Workbook();
    const sheetName = carrier && service
      ? `${carrier} - ${service}`.substring(0, 31)
      : "Tarifas de Envío";
    const worksheet = workbook.addWorksheet(sheetName);

    // Simplified headers — carrier+service come from query params, not the Excel
    const headers = ["CP Desde", "CP Hasta (opcional)", "Costo ($)"];
    const headerRow = worksheet.addRow(headers);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle" as const,
        wrapText: true,
      };
    });

    // Add example rows
    const exampleData = [
      [1000, 1999, 2500],
      [2000, 2999, 3200],
      [3000, 3999, 3800],
      [4000, null, 4500],
      [1425, null, 1800],
    ];

    exampleData.forEach((rowData) => {
      const row = worksheet.addRow(rowData);
      row.getCell(1).numFmt = "0";
      row.getCell(2).numFmt = "0";
      row.getCell(3).numFmt = "$#,##0.00";
    });

    worksheet.columns = [
      { width: 18 },
      { width: 22 },
      { width: 15 },
    ];

    worksheet.views = [{ state: "frozen" as const, ySplit: 1 }];

    // Add a note about the carrier+service on a second sheet for reference
    if (carrier && service) {
      const infoSheet = workbook.addWorksheet("Info");
      infoSheet.addRow(["Mensajería", carrier]);
      infoSheet.addRow(["Servicio", service]);
      infoSheet.addRow([]);
      infoSheet.addRow(["Esta info se usa automaticamente al importar."]);
      infoSheet.addRow(["No modifiques esta hoja."]);
      infoSheet.columns = [{ width: 20 }, { width: 30 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = carrier && service
      ? `tarifas-${carrier}-${service}.xlsx`.toLowerCase().replace(/\s+/g, "-")
      : "tarifas-envio-template.xlsx";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating Excel template:", error);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    );
  }
}
