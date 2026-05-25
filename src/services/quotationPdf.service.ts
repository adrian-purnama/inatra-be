import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";
import { buildQuotationPdfBuffer, type QuotationPdfInput } from "../lib/quotationToPdf.js";
import { getBranding } from "./branding.service.js";
import * as quotationService from "./quotation.service.js";

const PDF_EXPORT_STATUSES = new Set(["open", "close", "loss"]);

function sanitizeFilenamePart(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_");
}

type QuotationItem = NonNullable<
  Extract<Awaited<ReturnType<typeof quotationService.getQuotationById>>, { success: true }>["data"]
>["item"];

function quotationToPdfInput(item: QuotationItem): QuotationPdfInput {
  return {
    quotationNo: item.quotationNo,
    revisionNo: item.revisionNo,
    quotationStatus: item.quotationStatus,
    approverEmail: item.approverEmail,
    approvedAt: item.approvedAt,
    lineOfBusinessName: item.lineOfBusinessName,
    marketSegmentName: item.marketSegmentName,
    customer: item.customer,
    endUser: item.endUser,
    contact: item.contact,
    notes: item.notes,
    locationNames: item.locationNames,
    currency: item.currency,
    taxRate: item.taxRate,
    discountTotal: item.discountTotal,
    subTotal: item.subTotal,
    taxAmount: item.taxAmount,
    grandTotal: item.grandTotal,
    validUntil: item.validUntil,
    termsAndConditions: item.termsAndConditions,
    createdAt: item.createdAt,
    details: item.details.map((d) => ({
      sortOrder: d.sortOrder,
      description: d.description,
      quantity: d.quantity,
      unit: d.unit,
      sku: d.sku,
      price: d.price,
      discount: d.discount,
    })),
  };
}

export async function exportQuotationPdf(
  _userId: string | undefined,
  quotationId: string | undefined,
): Promise<ServiceResult<{ buffer: Buffer; filename: string }>> {
  const loaded = await quotationService.getQuotationById(quotationId);
  if (!loaded.success || loaded.data == null) {
    return failResult(loaded.code, loaded.message, loaded.data);
  }
  const item = loaded.data.item;
  const status = String(item.quotationStatus);
  if (!PDF_EXPORT_STATUSES.has(status)) {
    return failResult(
      400,
      "PDF is only available for approved quotations (open, close, or loss)",
    );
  }

  const brandingResult = await getBranding();
  if (!brandingResult.success || brandingResult.data == null) {
    return failResult(
      brandingResult.code,
      brandingResult.message ?? "Could not load branding",
    );
  }

  const buffer = await buildQuotationPdfBuffer(
    quotationToPdfInput(item),
    brandingResult.data,
  );
  const filename = `Quotation_${sanitizeFilenamePart(item.quotationNo)}_Rev${item.revisionNo}.pdf`;
  return okResult(200, "OK", { buffer, filename });
}
