import type { SaleDetail } from "@mobileshop/shared";
import { ApiError, type ApiClient } from "./client";
import { apiClient } from "./health";
import { getSale, getSales } from "./sales";

export type ReturnSaleLookup =
  | {
      readonly availability: "found";
      readonly invoiceNumber: string;
      readonly sale: SaleDetail;
    }
  | {
      readonly availability: "not_found";
      readonly invoiceNumber: string;
    };

function normalizedInvoice(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toUpperCase()
    .slice(0, 100);
}

/**
 * Read-only proof-of-purchase lookup over the implemented Sales API.
 *
 * This deliberately does not claim return eligibility: policy windows, prior
 * returned quantities and return persistence belong to the missing Returns API.
 */
export async function lookupOriginalSaleForReturn(
  invoiceNumber: string,
  client: ApiClient = apiClient,
): Promise<ReturnSaleLookup> {
  const invoice = normalizedInvoice(invoiceNumber);
  if (invoice.length === 0) {
    throw new ApiError("Enter an invoice number to look up.", {
      code: "VALIDATION_FAILED",
    });
  }
  const matches = await getSales(
    {
      page: 1,
      pageSize: 100,
      q: invoice,
      sort: "posted_at",
      direction: "desc",
    },
    undefined,
    client,
  );
  const exact = matches.items.find(
    (sale) => sale.invoiceNumber?.toUpperCase() === invoice,
  );
  if (exact === undefined) {
    return { availability: "not_found", invoiceNumber: invoice };
  }
  const sale = await getSale(exact.id, undefined, client);
  if (sale.invoiceNumber?.toUpperCase() !== invoice) {
    throw new ApiError("The Sales API returned a different invoice detail.", {
      code: "INVALID_RESPONSE",
    });
  }
  return { availability: "found", invoiceNumber: invoice, sale };
}
