import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  createCustomer,
  getCustomers,
  setCustomerActive,
  updateCustomer,
} from "./customers";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const customer = {
  id: CUSTOMER_ID,
  name: "Ayesha Khan",
  phone: "+923001234567",
  marketingConsent: "granted",
  purchaseCount: 3,
  lifetimeSpendMinor: 350_000,
  receivableBalanceMinor: 0,
  lastVisitAt: "2026-07-16T10:00:00.000Z",
  isActive: true,
  version: 2,
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
  email: "ayesha@example.com",
  addressLine: "Gulberg, Lahore",
  notes: null,
  sensitive: { availability: "redacted" },
} as const;

function clientFor(payload: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    client: new ApiClient("https://api.test/api/v1", { fetcher }),
    fetcher,
  };
}

function requestBody(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  const init = fetcher.mock.calls[0]?.[1];
  return init?.body === undefined ? undefined : JSON.parse(String(init.body));
}

describe("customers API", () => {
  it("serializes the prototype customer picker filters", async () => {
    const page = {
      items: [
        {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          marketingConsent: customer.marketingConsent,
          purchaseCount: customer.purchaseCount,
          lifetimeSpendMinor: customer.lifetimeSpendMinor,
          receivableBalanceMinor: customer.receivableBalanceMinor,
          lastVisitAt: customer.lastVisitAt,
          isActive: customer.isActive,
          version: customer.version,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    };
    const { client, fetcher } = clientFor(page);

    await expect(
      getCustomers(
        {
          page: 1,
          pageSize: 25,
          q: "Ayesha",
          hasReceivable: false,
          active: true,
          sort: "name",
          direction: "asc",
        },
        undefined,
        client,
      ),
    ).resolves.toEqual(page);

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/customers");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: "Ayesha",
      hasReceivable: "false",
      active: "true",
      sort: "name",
      direction: "asc",
    });
  });

  it("normalizes a Pakistan counter phone before creation", async () => {
    const { client, fetcher } = clientFor(customer);

    await createCustomer(
      {
        name: "  Ayesha   Khan ",
        phone: "0300-1234567",
        email: "AYESHA@EXAMPLE.COM",
        marketingConsent: "granted",
        addressLine: "Gulberg, Lahore",
        notes: null,
      },
      client,
    );

    expect(requestBody(fetcher)).toMatchObject({
      name: "Ayesha Khan",
      phone: "+923001234567",
      email: "ayesha@example.com",
    });
  });

  it("sends optimistic versions for update and lifecycle changes", async () => {
    const updateClient = clientFor(customer);
    await updateCustomer(
      CUSTOMER_ID,
      {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        marketingConsent: customer.marketingConsent,
        addressLine: customer.addressLine,
        notes: customer.notes,
        version: customer.version,
      },
      updateClient.client,
    );
    expect(requestBody(updateClient.fetcher)).toMatchObject({ version: 2 });

    const lifecycleClient = clientFor({
      ...customer,
      isActive: false,
      version: 3,
    });
    await setCustomerActive(CUSTOMER_ID, 2, false, lifecycleClient.client);
    expect(requestBody(lifecycleClient.fetcher)).toEqual({ version: 2 });
    expect(String(lifecycleClient.fetcher.mock.calls[0]?.[0])).toContain(
      `/customers/${CUSTOMER_ID}/deactivate`,
    );
  });
});
