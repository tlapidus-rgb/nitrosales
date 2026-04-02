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

/**
 * POST /api/finance/shipping-rates/import
 *
 * Imports shipping rates from an Excel file.
 * Carrier and service are passed as FormData fields (not from the Excel),
 * ensuring exact match with order data.
 *
 * FormData:
 * - file: the .xlsx file (columns: CP Desde, CP Hasta, Costo)
 * - carrier: the carrier name (e.g. "Andreani")
 * - service: the service type (e.g. "Normal")
 */
export async function POST(req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const carrier = (formData.get("carrier") as string) || "";
    const service = (formData.get("service") as string) || "";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!carrier || !service) {
      return NextResponse.json(
        { error: "Carrier y servicio son requeridos" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

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

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const postalCodeFrom = row.getCell("A").value;
      const postalCodeTo = row.getCell("B").value;
      const cost = row.getCell("C").value;

      const postalCodeFromStr = postalCodeFrom
        ? String(postalCodeFrom).trim()
        : "";
      const postalCodeToStr = postalCodeTo
        ? String(postalCodeTo).trim()
        : null;
      const costNum = cost ? Number(cost) : NaN;

      // Validate postalCodeFrom
      if (!postalCodeFromStr) {
        errors.push({
          row: rowNumber,
          field: "CP Desde",
          message: "El código postal es requerido",
        });
        return;
      }

      if (!/^\d+$/.test(postalCodeFromStr)) {
        errors.push({
          row: rowNumber,
          field: "CP Desde",
          message: "El código postal debe ser numérico",
        });
        return;
      }

      // Validate postalCodeTo if provided
      if (postalCodeToStr) {
        if (!/^\d+$/.test(postalCodeToStr)) {
          errors.push({
            row: rowNumber,
            field: "CP Hasta",
            message: "El código postal debe ser numérico",
          });
          return;
        }

        if (BigInt(postalCodeToStr) < BigInt(postalCodeFromStr)) {
          errors.push({
            row: rowNumber,
            field: "CP Hasta",
            message: "CP Hasta debe ser mayor o igual a CP Desde",
          });
          return;
        }
      }

      // Validate cost
      if (isNaN(costNum) || costNum <= 0) {
        errors.push({
          row: rowNumber,
          field: "Costo",
          message: "El costo debe ser un número positivo",
        });
        return;
      }

      validRows.push({
        carrier,
        serviceType: service,
        serviceCode: null,
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

    const totalRows = worksheet.rowCount - 1;

    return NextResponse.json({
      imported,
      errors,
      totalRows,
      carrier,
      service,
    });
  } catch (error) {
    console.error("Error importing shipping rates:", error);
    return NextResponse.json(
      { error: "Error processing file" },
      { status: 500 }
    );
  }
}
