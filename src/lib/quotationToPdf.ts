import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Content, TableCell } from "pdfmake";
import { CURRENCY_LIST } from "../models/quotation/quotationHeader.model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUOTATION_LOGO_FILENAME = "logo.png";
const WATERMARK_OPACITY = 0.3;

const require = createRequire(import.meta.url);
const pdfMake = require("pdfmake") as {
  createPdf: (doc: object) => { getBuffer: () => Promise<Buffer> };
  setFonts: (fonts: Record<string, Record<string, string>>) => void;
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
};
const robotoFonts = require("pdfmake/js/browser-extensions/fonts/Roboto.js") as {
  vfs: Record<string, { data: Buffer | string; encoding?: string }>;
  fonts: Record<string, Record<string, string>>;
};

let fontsReady = false;
function ensurePdfFonts(): void {
  if (fontsReady) return;
  for (const [name, entry] of Object.entries(robotoFonts.vfs)) {
    const raw = entry.data;
    const buf =
      typeof raw === "string"
        ? Buffer.from(raw, (entry.encoding as BufferEncoding) ?? "base64")
        : raw;
    pdfMake.virtualfs.writeFileSync(name, buf);
  }
  pdfMake.setFonts(robotoFonts.fonts);
  fontsReady = true;
}

export type QuotationPdfDetail = {
  sortOrder: number;
  description: string;
  quantity: number;
  unit: string;
  sku: string;
  price: number;
  discount: number;
};

export type QuotationPdfInput = {
  quotationNo: string;
  revisionNo: number;
  quotationStatus: string;
  approverEmail: string;
  approvedAt: Date | null;
  lineOfBusinessName: string;
  marketSegmentName: string;
  companyInformation: {
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
    companyWebsite: string;
  };
  customer: { customerName: string };
  endUser: { endUserName: string };
  contact: { contactName: string; contactSuffix: string; contactDetails: string[] };
  notes: string;
  locationNames: { provinceName: string; regencyName: string; districtName: string };
  currency: string;
  taxRate: number;
  discountTotal: number;
  subTotal: number;
  taxAmount: number;
  grandTotal: number;
  validUntil: Date | null;
  termsAndConditions: string;
  termsOfPaymentSelected: string[];
  termsOfDeliverySelected: string[];
  termsOfWarrantySelected: string[];
  createdAt: Date | undefined;
  details: QuotationPdfDetail[];
};

export type BrandingPdfInput = {
  appName: string;
  appLogo: string;
};

export type BuildQuotationPdfOptions = {
  generatedAt?: Date;
};

function currencySymbol(code: string): string {
  const found = CURRENCY_LIST.find((c) => c.code === code);
  return found?.symbol ?? code;
}

export function formatMoney(amount: number, currencyCode: string): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "0";
  const decimals = currencyCode === "IDR" ? 0 : 2;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMoneyWithSymbol(amount: number, currencyCode: string): string {
  return `${currencySymbol(currencyCode)} ${formatMoney(amount, currencyCode)}`;
}

function lineTotal(d: QuotationPdfDetail): number {
  return Number(d.quantity ?? 0) * Number(d.price ?? 0) - Number(d.discount ?? 0);
}

function formatDate(value: Date | null | undefined): string {
  if (value == null) return "—";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(value: Date | null | undefined): string {
  if (value == null) return "—";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function locationLine(names: QuotationPdfInput["locationNames"]): string {
  const parts = [names.provinceName, names.regencyName, names.districtName].filter(
    (p) => String(p ?? "").trim() !== "",
  );
  return parts.length > 0 ? parts.join(" / ") : "—";
}

/** pdfkit (via pdfmake) only embeds JPEG and PNG — not WebP, SVG, GIF, etc. */
function pdfKitImageMime(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  return null;
}

function bufferToDataUrl(buf: Buffer): string | null {
  const mime = pdfKitImageMime(buf);
  if (!mime) return null;
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Bundled quotation logo (`backend/src/image/logo.png`, copied to `dist/image` on build). */
let cachedQuotationLogoDataUrl: string | null | undefined;

function resolveQuotationLogoPath(): string | null {
  const candidates = [
    join(__dirname, "../image", QUOTATION_LOGO_FILENAME),
    join(process.cwd(), "src/image", QUOTATION_LOGO_FILENAME),
    join(process.cwd(), "dist/image", QUOTATION_LOGO_FILENAME),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function loadBundledQuotationLogoDataUrl(): string | null {
  if (cachedQuotationLogoDataUrl !== undefined) return cachedQuotationLogoDataUrl;
  const path = resolveQuotationLogoPath();
  if (!path) {
    cachedQuotationLogoDataUrl = null;
    return null;
  }
  try {
    cachedQuotationLogoDataUrl = bufferToDataUrl(readFileSync(path)) ?? null;
  } catch {
    cachedQuotationLogoDataUrl = null;
  }
  return cachedQuotationLogoDataUrl;
}

function buildWatermarkBackground(logoDataUrl: string): (
  _page: number,
  pageSize: { width: number; height: number },
) => Content {
  return (_page, pageSize) => {
    const width = Math.min(pageSize.width * 0.55, 320);
    const x = (pageSize.width - width) / 2;
    const y = (pageSize.height - width) / 2;
    return {
      image: logoDataUrl,
      width,
      opacity: WATERMARK_OPACITY,
      absolutePosition: { x, y },
    };
  };
}

function statusLabel(status: string): string {
  return String(status ?? "").replace(/_/g, " ");
}

export function buildDocDefinition(
  quotation: QuotationPdfInput,
  branding: BrandingPdfInput,
  options: BuildQuotationPdfOptions & { logoDataUrl?: string | null },
): object {
  const currency = quotation.currency || "IDR";
  const generatedAt = options.generatedAt ?? new Date();
  const logo = options.logoDataUrl;

  const headerLeft: Content[] = logo
    ? [{ image: logo, width: 72, margin: [0, 0, 0, 6] }]
    : [
        {
          text: branding.appName || "Quotation",
          style: "companyName",
        },
      ];

  // if (logo && branding.appName) {
  //   headerLeft.push({ text: branding.appName, style: "companyNameSmall", margin: [0, 4, 0, 0] });
  // }

  const metaRows: Content[] = [
    { text: "QUOTATION", style: "docTitle" },
    {
      text: [
        { text: "No: ", color: "#666" },
        { text: quotation.quotationNo, bold: true },
        { text: `  Rev: `, color: "#666" },
        { text: String(quotation.revisionNo), bold: true },
      ],
      margin: [0, 4, 0, 0],
    },
    {
      text: [
        { text: "Date: ", color: "#666" },
        formatDate(quotation.approvedAt ?? quotation.createdAt),
      ],
      fontSize: 9,
    },
    {
      text: [
        { text: "Valid until: ", color: "#666" },
        formatDate(quotation.validUntil),
      ],
      fontSize: 9,
    },
    {
      text: [
        { text: "Status: ", color: "#666" },
        { text: statusLabel(quotation.quotationStatus), bold: true },
      ],
      fontSize: 9,
    },
  ];

  const contactLines: string[] = [];
  const fullContactName = quotation.contact.contactName
    ? `${quotation.contact.contactName}${quotation.contact.contactSuffix ? ` ${quotation.contact.contactSuffix}` : ""}`
    : "";
  if (fullContactName) contactLines.push(fullContactName);
  // Intentionally do not include contact channels in the PDF.

  const tableBody: TableCell[][] = [
    [
      { text: "#", style: "tableHeader" },
      { text: "Description", style: "tableHeader" },
      { text: "Qty", style: "tableHeader", alignment: "right" },
      { text: "Unit", style: "tableHeader" },
      { text: "SKU", style: "tableHeader" },
      { text: "Unit price", style: "tableHeader", alignment: "right" },
      { text: "Discount", style: "tableHeader", alignment: "right" },
      { text: "Line total", style: "tableHeader", alignment: "right" },
    ],
  ];

  const sorted = [...quotation.details].sort((a, b) => a.sortOrder - b.sortOrder);
  sorted.forEach((d, idx) => {
    const zebra = idx % 2 === 1 ? "#f8fafc" : undefined;
    tableBody.push([
      { text: String(idx + 1), fillColor: zebra, fontSize: 8 },
      { text: d.description || "—", fillColor: zebra, fontSize: 8 },
      { text: formatMoney(d.quantity, currency), alignment: "right", fillColor: zebra, fontSize: 8 },
      { text: d.unit || "—", fillColor: zebra, fontSize: 8 },
      { text: d.sku || "—", fillColor: zebra, fontSize: 8 },
      {
        text: formatMoneyWithSymbol(d.price, currency),
        alignment: "right",
        fillColor: zebra,
        fontSize: 8,
      },
      {
        text: formatMoneyWithSymbol(d.discount, currency),
        alignment: "right",
        fillColor: zebra,
        fontSize: 8,
      },
      {
        text: formatMoneyWithSymbol(lineTotal(d), currency),
        alignment: "right",
        fillColor: zebra,
        fontSize: 8,
      },
    ]);
  });

  if (sorted.length === 0) {
    tableBody.push([
      { text: "—", colSpan: 8, alignment: "center", italics: true, color: "#888" },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
    ]);
  }

  const totalsBlock: Content = {
    columns: [
      { width: "*", text: "" },
      {
        width: 220,
        table: {
          widths: ["*", "auto"],
          body: [
            [
              { text: "Subtotal", color: "#555", border: [false, false, false, false] },
              {
                text: formatMoneyWithSymbol(quotation.subTotal, currency),
                alignment: "right",
                border: [false, false, false, false],
              },
            ],
            [
              { text: "Document discount", color: "#555", border: [false, false, false, false] },
              {
                text: formatMoneyWithSymbol(quotation.discountTotal, currency),
                alignment: "right",
                border: [false, false, false, false],
              },
            ],
            [
              {
                text: `Tax (${formatMoney(quotation.taxRate, currency)}%)`,
                color: "#555",
                border: [false, false, false, false],
              },
              {
                text: formatMoneyWithSymbol(quotation.taxAmount, currency),
                alignment: "right",
                border: [false, false, false, false],
              },
            ],
            [
              { text: "Grand total", bold: true, fontSize: 11, border: [false, true, false, false] },
              {
                text: formatMoneyWithSymbol(quotation.grandTotal, currency),
                alignment: "right",
                bold: true,
                fontSize: 11,
                border: [false, true, false, false],
              },
            ],
          ],
        },
        layout: "noBorders",
      },
    ],
    margin: [0, 12, 0, 0],
  };

  const content: Content[] = [
    {
      columns: [
        { width: "55%", stack: headerLeft },
        { width: "45%", stack: metaRows, alignment: "right" },
      ],
      margin: [0, 0, 0, 20],
    },
    {
      columns: [
        {
          width: "60%",
          stack: [
            {
              text: quotation.companyInformation.companyName || branding.appName || "—",
              bold: true,
              margin: [0, 2, 0, 0],
            },
            ...(quotation.companyInformation.companyAddress
              ? [
                  {
                    text: quotation.companyInformation.companyAddress,
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
            ...(quotation.companyInformation.companyPhone
              ? [
                  {
                    text: `Phone: ${quotation.companyInformation.companyPhone}`,
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
            ...(quotation.companyInformation.companyEmail
              ? [
                  {
                    text: `Email: ${quotation.companyInformation.companyEmail}`,
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
            ...(quotation.companyInformation.companyWebsite
              ? [
                  {
                    text: `Website: ${quotation.companyInformation.companyWebsite}`,
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
          ],
        },
        { width: "40%", text: "" },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        {
          width: "50%",
          stack: [
            { text: "To", style: "sectionLabel" },
            { text: quotation.customer.customerName || "—", bold: true, margin: [0, 2, 0, 0] },
          ],
        },
        {
          width: "50%",
          stack: [
            { text: "Attn", style: "sectionLabel" },
            {
              text:
                quotation.contact.contactName || quotation.contact.contactSuffix
                  ? `${quotation.contact.contactSuffix ? `${quotation.contact.contactSuffix} ` : ""}${quotation.contact.contactName}`
                  : "—",
              margin: [0, 2, 0, 0] as [number, number, number, number],
            },
          ],
        },
      ],
      margin: [0, 0, 0, 12],
    },
    // Divider line before line items
    {
      canvas: [
        { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#e2e8f0" },
      ],
      margin: [0, 6, 0, 10],
    } as unknown as Content,
    {
      table: {
        headerRows: 1,
        widths: [18, "*", 32, 36, 48, 58, 52, 58],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number) => (i === 1 ? "#334155" : "#e2e8f0"),
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    },
    totalsBlock,
  ];

  if (String(quotation.termsAndConditions ?? "").trim()) {
    content.push(
      { text: "Terms & conditions", style: "sectionLabel", margin: [0, 16, 0, 4] },
      { text: quotation.termsAndConditions, fontSize: 8, color: "#444" },
    );
  }

  const selectedPayment = (quotation.termsOfPaymentSelected ?? []).filter((x) => String(x).trim());
  const selectedDelivery = (quotation.termsOfDeliverySelected ?? []).filter((x) => String(x).trim());
  const selectedWarranty = (quotation.termsOfWarrantySelected ?? []).filter((x) => String(x).trim());
  if (selectedPayment.length || selectedDelivery.length || selectedWarranty.length) {
    content.push({ text: "Selected terms", style: "sectionLabel", margin: [0, 16, 0, 4] });
    if (selectedPayment.length) {
      content.push(
        { text: "Terms of payment", style: "sectionLabel", margin: [0, 8, 0, 2] },
        { ul: selectedPayment, fontSize: 8, color: "#444" } as unknown as Content,
      );
    }
    if (selectedDelivery.length) {
      content.push(
        { text: "Terms of delivery", style: "sectionLabel", margin: [0, 8, 0, 2] },
        { ul: selectedDelivery, fontSize: 8, color: "#444" } as unknown as Content,
      );
    }
    if (selectedWarranty.length) {
      content.push(
        { text: "Warranty", style: "sectionLabel", margin: [0, 8, 0, 2] },
        { ul: selectedWarranty, fontSize: 8, color: "#444" } as unknown as Content,
      );
    }
  }
  if (String(quotation.notes ?? "").trim()) {
    content.push(
      { text: "Notes", style: "sectionLabel", margin: [0, 12, 0, 4] },
      { text: quotation.notes, fontSize: 8, color: "#444" },
    );
  }

  const footerStack: Content[] = [];
  if (quotation.approverEmail || quotation.approvedAt) {
    footerStack.push({
      text: [
        ...(quotation.approverEmail
          ? [{ text: "Approved by: ", color: "#666" }, { text: quotation.approverEmail }]
          : []),
        ...(quotation.approvedAt
          ? [
              { text: " on ", color: "#666" },
              { text: formatDateTime(quotation.approvedAt) },
            ]
          : []),
      ],
      fontSize: 8,
      margin: [0, 0, 0, 4],
    });
  }
  footerStack.push({
    text: `Generated by ${branding.appName || "Inatra"} · ${formatDateTime(generatedAt)}`,
    fontSize: 7,
    color: "#94a3b8",
    alignment: "center",
  });

  content.push({ stack: footerStack, margin: [0, 24, 0, 0] });

  const docDef: Record<string, unknown> = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#1e293b" },
    styles: {
      companyName: { fontSize: 16, bold: true, color: "#0f172a" },
      companyNameSmall: { fontSize: 10, color: "#475569" },
      docTitle: { fontSize: 18, bold: true, color: "#0f172a", alignment: "right" },
      sectionLabel: {
        fontSize: 8,
        bold: true,
        color: "#64748b",
        characterSpacing: 0.5,
      },
      tableHeader: {
        bold: true,
        fontSize: 8,
        color: "#ffffff",
        fillColor: "#334155",
      },
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 7,
      color: "#94a3b8",
      margin: [0, 8, 0, 0],
    }),
  };

  if (logo) {
    docDef.background = buildWatermarkBackground(logo);
  }

  return docDef;
}

export async function buildQuotationPdfBuffer(
  quotation: QuotationPdfInput,
  branding: BrandingPdfInput,
  options?: BuildQuotationPdfOptions,
): Promise<Buffer> {
  ensurePdfFonts();
  const logoDataUrl = loadBundledQuotationLogoDataUrl();
  const doc = buildDocDefinition(quotation, branding, {
    ...options,
    logoDataUrl,
  });
  const pdfDoc = pdfMake.createPdf(doc);
  return pdfDoc.getBuffer();
}
