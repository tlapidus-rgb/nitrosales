import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/finance/fiscal-profile/parse-constancia
 * Receives a PDF of AFIP "Constancia de Inscripción", extracts text,
 * and returns a parsed fiscal profile.
 *
 * The AFIP constancia PDF has these standard sections:
 * - Header with CUIT and name
 * - "Datos del Contribuyente" (name, CUIT, tipo persona)
 * - "Domicilio Fiscal" (street, city, province, CP)
 * - "Impuestos" table (impuesto code, descripción, período desde, estado)
 *   Key codes: 20 = Monotributo, 30 = IVA, 32 = IVA No Inscripto,
 *   301 = IIBB Convenio Multilateral, etc.
 * - "Categorización Monotributo" (if applicable: categoría)
 * - "Actividades" table (código, descripción, período)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Archivo PDF requerido" },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "El archivo debe ser un PDF" },
        { status: 400 }
      );
    }

    // Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    // pdf-parse v1.x exports a single function
    const pdfParse = (await import("pdf-parse")) as any;
    const parseFn = pdfParse.default || pdfParse;
    const pdfData = await parseFn(Buffer.from(arrayBuffer));
    const text: string = pdfData.text;

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "No se pudo extraer texto del PDF. Asegurate de que sea una constancia de inscripción de AFIP válida." },
        { status: 400 }
      );
    }

    // Parse the extracted text
    const result = parseConstanciaText(text);

    if (!result.cuit) {
      return NextResponse.json(
        { error: "No se encontró un CUIT válido en el documento. Verificá que sea una constancia de inscripción de AFIP/ARCA." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      parsed: true,
      rawTextLength: text.length,
      ...result,
    });
  } catch (error: any) {
    console.error("Error parsing constancia:", error);
    return NextResponse.json(
      { error: `Error al procesar el PDF: ${error.message}` },
      { status: 500 }
    );
  }
}

interface ParsedConstancia {
  cuit: string | null;
  name: string | null;
  province: string | null;
  provinceCode: string | null;
  taxRegime: "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO" | null;
  monotributoCategory: string | null;
  hasConvenioMultilateral: boolean;
  sellsOnMarketplace: boolean;
  impuestos: Array<{ code: string; description: string; estado: string }>;
  actividades: string[];
  confidence: number; // 0-100 how confident we are in the parse
  warnings: string[];
}

function parseConstanciaText(text: string): ParsedConstancia {
  const result: ParsedConstancia = {
    cuit: null,
    name: null,
    province: null,
    provinceCode: null,
    taxRegime: null,
    monotributoCategory: null,
    hasConvenioMultilateral: false,
    sellsOnMarketplace: false, // conservative default; user can toggle
    impuestos: [],
    actividades: [],
    confidence: 0,
    warnings: [],
  };

  // Normalize text: collapse multiple spaces/newlines
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);

  // ── 1. Extract CUIT ──
  // CUIT format: XX-XXXXXXXX-X (with or without dashes)
  const cuitPatterns = [
    /CUIT\s*:?\s*(\d{2}-?\d{8}-?\d)/i,
    /C\.U\.I\.T\.\s*:?\s*(\d{2}-?\d{8}-?\d)/i,
    /(\d{2}-\d{8}-\d)/,
  ];
  for (const pattern of cuitPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      result.cuit = match[1].replace(/-/g, "");
      // Re-format with dashes
      if (result.cuit.length === 11) {
        result.cuit = `${result.cuit.slice(0, 2)}-${result.cuit.slice(2, 10)}-${result.cuit.slice(10)}`;
      }
      result.confidence += 30;
      break;
    }
  }

  // ── 2. Extract Name / Razón Social ──
  // Usually near the CUIT or under "Apellido y Nombre" / "Razón Social"
  const namePatterns = [
    /(?:Apellido\s+y\s+Nombre|Raz[oó]n\s+Social)\s*:?\s*(.+)/i,
    /(?:DENOMINACI[OÓ]N|NOMBRE)\s*:?\s*(.+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      result.name = match[1].trim().substring(0, 200);
      break;
    }
  }

  // ── 3. Extract Province from Domicilio Fiscal ──
  const provinceMap: Record<string, string> = {
    "ciudad autonoma de buenos aires": "CABA",
    "capital federal": "CABA",
    "caba": "CABA",
    "buenos aires": "BUENOS_AIRES",
    "cordoba": "CORDOBA",
    "córdoba": "CORDOBA",
    "santa fe": "SANTA_FE",
    "mendoza": "MENDOZA",
    "tucuman": "TUCUMAN",
    "tucumán": "TUCUMAN",
    "entre rios": "ENTRE_RIOS",
    "entre ríos": "ENTRE_RIOS",
    "salta": "SALTA",
    "misiones": "MISIONES",
    "corrientes": "CORRIENTES",
    "chaco": "CHACO",
    "san juan": "SAN_JUAN",
    "san luis": "SAN_LUIS",
    "santiago del estero": "SANTIAGO_DEL_ESTERO",
    "jujuy": "JUJUY",
    "rio negro": "RIO_NEGRO",
    "río negro": "RIO_NEGRO",
    "neuquen": "NEUQUEN",
    "neuquén": "NEUQUEN",
    "formosa": "FORMOSA",
    "chubut": "CHUBUT",
    "la pampa": "LA_PAMPA",
    "catamarca": "CATAMARCA",
    "la rioja": "LA_RIOJA",
    "santa cruz": "SANTA_CRUZ",
    "tierra del fuego": "TIERRA_DEL_FUEGO",
  };

  // Look for province in domicilio section
  const domicilioSection = normalized.match(
    /(?:domicilio\s+fiscal|domicilio)[^\n]*\n([\s\S]{0,500}?)(?=\n\s*(?:impuesto|actividad|categor|---|\*\*\*))/i
  );
  const domicilioText = domicilioSection ? domicilioSection[1] : normalized;

  // Try province patterns
  const provinciaMatch = domicilioText.match(/(?:provincia|prov\.?)\s*:?\s*(.+)/i);
  if (provinciaMatch) {
    const provText = provinciaMatch[1].trim().toLowerCase();
    for (const [key, code] of Object.entries(provinceMap)) {
      if (provText.includes(key)) {
        result.province = provinceMap[key] ? key : provText;
        result.provinceCode = code;
        result.confidence += 20;
        break;
      }
    }
  }

  // Fallback: search the full text for province names near "domicilio"
  if (!result.provinceCode) {
    const lowerText = normalized.toLowerCase();
    // Look for province names - try longer names first to avoid false matches
    const sortedProvinces = Object.entries(provinceMap)
      .sort(([a], [b]) => b.length - a.length);
    for (const [provName, provCode] of sortedProvinces) {
      // Check if province appears near "domicilio" context
      const domIdx = lowerText.indexOf("domicilio");
      if (domIdx >= 0) {
        const nearDomicilio = lowerText.substring(domIdx, domIdx + 500);
        if (nearDomicilio.includes(provName)) {
          result.province = provName;
          result.provinceCode = provCode;
          result.confidence += 15;
          break;
        }
      }
    }
  }

  // ── 4. Detect Tax Regime from Impuestos ──
  const impuestoPatterns = [
    // Monotributo indicators
    { pattern: /(?:20|monotributo|r[eé]gimen\s+simplificado)/i, type: "MONOTRIBUTO" as const },
    // Responsable Inscripto indicators
    { pattern: /(?:30|IVA(?:\s+RESPONSABLE)?|RESPONSABLE\s+INSCRIPTO)/i, type: "RI" as const },
    // Convenio Multilateral
    { pattern: /(?:301|CONVENIO\s+MULTILATERAL)/i, type: "CM" as const },
  ];

  // Detect Monotributo
  const hasMonotributo = /(?:monotributo|r[eé]gimen\s+simplificado|impuesto.*20)/i.test(normalized);
  const hasIVA = /(?:IVA|impuesto.*30\b)/i.test(normalized);
  const hasConvenioML = /(?:convenio\s+multilateral|301)/i.test(normalized);

  // Extract impuestos table entries
  // Typical format: "20 - REGIMEN SIMPLIFICADO MONOTRIBUTO    01/2020    ACTIVO"
  const impuestoLinePattern = /(\d{1,3})\s*[-–]\s*(.+?)(?:\s+(?:(\d{2}\/\d{4})\s+)?(\bACTIVO\b|\bINACTIVO\b|\bBaja\b))?$/gim;
  let impMatch;
  while ((impMatch = impuestoLinePattern.exec(normalized)) !== null) {
    result.impuestos.push({
      code: impMatch[1],
      description: impMatch[2].trim(),
      estado: (impMatch[4] || "").toUpperCase(),
    });
  }

  // Also check for impuesto descriptions without strict line format
  if (result.impuestos.length === 0) {
    // Looser search: find lines that look like tax entries
    for (const line of lines) {
      if (/(?:monotributo|ganancias|ingresos\s+brutos|iva\b|convenio\s+multilateral)/i.test(line)) {
        const isActive = /activ/i.test(line);
        result.impuestos.push({
          code: "",
          description: line.substring(0, 100),
          estado: isActive ? "ACTIVO" : "",
        });
      }
    }
  }

  // Determine regime based on detected taxes
  if (hasMonotributo) {
    result.taxRegime = "MONOTRIBUTO";
    result.confidence += 25;
  } else if (hasIVA) {
    result.taxRegime = "RESPONSABLE_INSCRIPTO";
    result.confidence += 25;
  }

  if (hasConvenioML) {
    result.hasConvenioMultilateral = true;
    result.confidence += 5;
  }

  // ── 5. Extract Monotributo Category ──
  if (result.taxRegime === "MONOTRIBUTO") {
    // Look for category: "Categoría: D", "Cat. D", "CATEGORIA D"
    const catPatterns = [
      /categor[ií]a\s*:?\s*([A-K])\b/i,
      /\bcat\.?\s*([A-K])\b/i,
      /\bcategor[ií]a\s+([A-K])\b/i,
      /categorizaci[oó]n.*?\b([A-K])\b/i,
    ];
    for (const pattern of catPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        result.monotributoCategory = match[1].toUpperCase();
        result.confidence += 10;
        break;
      }
    }
    if (!result.monotributoCategory) {
      result.warnings.push("No se pudo detectar la categoría de Monotributo. Seleccionala manualmente.");
    }
  }

  // ── 6. Extract Activities ──
  const actPattern = /(\d{5,6})\s*[-–]\s*(.+)/g;
  let actMatch;
  while ((actMatch = actPattern.exec(normalized)) !== null) {
    const actDesc = actMatch[2].trim();
    if (actDesc.length > 5 && actDesc.length < 200) {
      result.actividades.push(`${actMatch[1]} - ${actDesc}`);
    }
  }

  // ── 7. Generate warnings ──
  if (!result.provinceCode) {
    result.warnings.push("No se pudo detectar la provincia del domicilio fiscal. Seleccionala manualmente.");
  }
  if (!result.taxRegime) {
    result.warnings.push("No se pudo determinar el régimen impositivo (Monotributo/RI). Seleccionalo manualmente.");
  }
  if (result.impuestos.length === 0) {
    result.warnings.push("No se detectaron impuestos en el documento. Verificá que sea una constancia de inscripción.");
  }

  // Cap confidence
  result.confidence = Math.min(result.confidence, 100);

  return result;
}
