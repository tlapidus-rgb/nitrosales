import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tarifas de Envío");

    // Define headers
    const headers = [
      "Mensajería",
      "Tipo de Servicio",
      "Código de Servicio",
      "CP Desde",
      "CP Hasta",
      "Costo ($)",
    ];

    // Add headers to row 1
    const headerRow = worksheet.addRow(headers);

    // Style header row: bold, blue background, white text
    headerRow.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: "FFFFFFFF" }, // white text
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" }, // blue background
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    });

    // Add example rows
    const exampleData = [
      ["ANDREANI", "ESTANDAR", "AND-STD", 1000, 1999, 2500],
      ["ANDREANI", "ESTANDAR", "AND-STD", 2000, 2999, 3200],
      ["ANDREANI", "EXPRESS", "AND-EXP", 1000, 1999, 4200],
      ["OCA", "ESTANDAR", "OCA-STD", 1000, null, 2800],
      ["MOTOS_CABA", "SAME_DAY", "MOTO-SD", 1000, 1499, 1500],
    ];

    exampleData.forEach((rowData) => {
      const row = worksheet.addRow(rowData);

      // Format number columns (D, E, F are columns 4, 5, 6)
      row.getCell(4).numFmt = "0"; // CP Desde
      row.getCell(5).numFmt = "0"; // CP Hasta
      row.getCell(6).numFmt = '$#,##0.00'; // Costo
    });

    // Set column widths
    worksheet.columns = [
      { width: 20 }, // A: Mensajería
      { width: 20 }, // B: Tipo de Servicio
      { width: 20 }, // C: Código de Servicio
      { width: 12 }, // D: CP Desde
      { width: 12 }, // E: CP Hasta
      { width: 15 }, // F: Costo ($)
    ];

    // Freeze the header row
    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1, // Freeze the first row
      },
    ];

    // Write workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return response with proper headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="tarifas-envio-template.xlsx"',
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
