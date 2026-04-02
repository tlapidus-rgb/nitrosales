export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { Decimal } from "@prisma/client/runtime/library";

interface RowError {
  row: number;
  field: string;
  message: string;
}

interface ValidRow {
  carrier: string;
  serviceType: string;
  serviceCode: string | null;
  postalCodeFrom: string;
  postalCodeTo: string | null;
  cost: Decimal;
}

export async function POST(req: NextRequest) {
  try {
    // Get organization ID
    const organizationId = await getOrganizationId();

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();

    // Parse Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return NextResponse.json(
        { error: "No worksheet found in Excel file" },
        { status: 400 }
      );
    }

    const errors: RowError[] = [];
    const validRows: ValidRow[] = [];

    // Skip header row (row 1) and process data rows
    let rowIndex = 2;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const carrier = row.getCell("A").value;
      const serviceType = row.getCell("B").value;
      const serviceCode = row.getCell("C").value;
      const postalCodeFrom = row.getCell("D").value;
      const postalCodeTo = row.getCell("E").value;
      const cost = row.getCell("F").value;

      // Normalize values - handle both string and number types
      const carrierStr = carrier ? String(carrier).trim() : "";
      const serviceTypeStr = serviceType ? String(serviceType).trim() : "";
      const serviceCodeStr = serviceCode ? String(serviceCode).trim() : null;
      const postalCodeFromStr = postalCodeFrom
        ? String(postalCodeFrom).trim()
        : "";
      const postalCodeToStr = postalCodeTo
        ? String(postalCodeTo).trim()
        : null;
      const costNum = cost ? Number(cost) : NaN;

      // Validate carrier
      if (!carrierStr) {
        errors.push({
          row: rowNumber,
          field: "carrier",
          message: "La mensajería es requerida",
        });
        return;
      }

      // Validate serviceType
      if (!serviceTypeStr) {
        errors.push({
          row: rowNumber,
          field: "serviceType",
          message: "El tipo de servicio es requerido",
        });
        return;
      }

      // Validate postalCodeFrom
      if (!postalCodeFromStr) {
        errors.push({
          row: rowNumber,
          field: "postalCodeFrom",
          message: "El código postal de origen es requerido",
        });
        return;
      }

      if (!/^\d+$/.test(postalCodeFromStr)) {
        errors.push({
          row: rowNumber,
          field: "postalCodeFrom",
          message: "El código postal de origen debe ser numérico",
        });
        return;
      }

      // Validate postalCodeTo if provided
      if (postalCodeToStr) {
        if (!/^\d+$/.test(postalCodeToStr)) {
          errors.push({
            row: rowNumber,
            field: "postalCodeTo",
            message: "El código postal de destino debe ser numérico",
          });
          return;
        }

        // Validate postalCodeTo >= postalCodeFrom
        if (BigInt(postalCodeToStr) < BigInt(postalCodeFromStr)) {
          errors.push({
            row: rowNumber,
            field: "postalCodeTo",
            message:
              "El código postal de destino debe ser mayor o igual al de origen",
          });
          return;
        }
      }

      // Validate cost
      if (isNaN(costNum) || costNum <= 0) {
        errors.push({
          row: rowNumber,
          field: "cost",
          message: "El costo debe ser un número positivo",
        });
        return;
      }

      // All validations passed
      validRows.push({
        carrier: carrierStr,
        serviceType: serviceTypeStr,
        serviceCode: serviceCodeStr,
        postalCodeFrom: postalCodeFromStr,
        postalCodeTo: postalCodeToStr,
        cost: new Decimal(costNum.toString()),
      });
    });

    // Bulk insert valid rows
    let imported = 0;
    if (validRows.length > 0) {
      const result = await prisma.shippingRate.createMany({
        data: validRows.map((row) => ({
          ...row,
          organizationId,
          isActive: true,
        })),
        skipDuplicates: true,
      });
      imported = result.count;
    }

    // Calculate total rows processed
    const totalRows = worksheet.rowCount - 1; // Exclude header

    return NextResponse.json({
      imported,
      errors,
      totalRows,
    });
  } catch (error) {
    console.error("Error importing shipping rates:", error);
    return NextResponse.json(
      { error: "Error processing file" },
      { status: 500 }
    );
  }
}
