import { getAddress } from "viem";
import { buildHmacHeaders } from "./auth.js";
import { canonicalStringify } from "./canonical.js";
import { buildMerchantJWT } from "./jwt.js";

const HSK_REUSABLE_PATH = "/api/v1/merchant/orders/reusable";

type ReusableOrderResponse = {
  data?: {
    payment_url?: string;
    payment_request_id?: string;
  };
};

/** Doc examples use `2024-03-01T12:00:00Z` without fractional seconds. */
function cartExpiryIsoSeconds(): string {
  return new Date(Date.now() + 365 * 86400 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function buildCartContents(intent: {
  intentId: string;
  merchant: string;
  amountTotal: string;
}) {
  const usdc = process.env.USDC_CONTRACT?.trim();
  const escrow = process.env.ESCROW_ADDRESS?.trim();
  const network =
    process.env.HASHKEY_CART_NETWORK?.trim() || process.env.CHAIN_NETWORK?.trim();
  const chainId = Number(process.env.CHAIN_ID);
  const merchantName = process.env.MERCHANT_NAME?.trim();
  if (!usdc || !escrow || !network || !Number.isFinite(chainId) || !merchantName) {
    throw new Error("CHAIN_NETWORK, CHAIN_ID, USDC_CONTRACT, ESCROW_ADDRESS, MERCHANT_NAME are required");
  }

  const amountUsd = (Number(intent.amountTotal) / 1e6).toFixed(2);
  const paymentRequestId = `PAY-REQ-${intent.intentId}`;
  return {
    id: intent.intentId,
    user_cart_confirmation_required: true,
    payment_request: {
      method_data: [
        {
          supported_methods: "https://www.x402.org/",
          data: {
            x402Version: 2,
            network,
            chain_id: chainId,
            contract_address: getAddress(usdc as `0x${string}`),
            pay_to: getAddress(escrow as `0x${string}`),
            coin: "USDC",
          },
        },
      ],
      details: {
        id: paymentRequestId,
        display_items: [
          {
            label: "PayFi Escrow Deposit",
            amount: { currency: "USD", value: amountUsd },
          },
        ],
        total: {
          label: "Total",
          amount: { currency: "USD", value: amountUsd },
        },
      },
    },
    cart_expiry: cartExpiryIsoSeconds(),
    merchant_name: merchantName,
  };
}

export async function createReusableOrder(input: {
  intentId: string;
  merchant: string;
  amountTotal: string;
}) {
  const baseUrl = process.env.HASHKEY_BASE_URL?.trim();
  const appKey = process.env.APP_KEY?.trim();
  const appSecret = process.env.APP_SECRET?.trim();
  if (!baseUrl) throw new Error("HASHKEY_BASE_URL is required");
  if (!appKey) throw new Error("APP_KEY is required");
  if (!appSecret) throw new Error("APP_SECRET is required");

  const contents = buildCartContents(input);
  const jwt = await buildMerchantJWT(contents);
  const requestBody: Record<string, unknown> = {
    cart_mandate: {
      contents,
      merchant_authorization: jwt,
    },
  };
  const redirectFixed = process.env.HASHKEY_REDIRECT_URL?.trim();
  const baseUrlForRedirect = process.env.BASE_URL?.trim() ?? "";
  if (redirectFixed) {
    requestBody.redirect_url = redirectFixed;
  } else if (baseUrlForRedirect) {
    // QA may require https; production checkouts often do. Local http still sent so devs see real API errors vs missing field.
    const base = baseUrlForRedirect.replace(/\/$/, "");
    requestBody.redirect_url = `${base}/payment/result`;
  }
  if (typeof requestBody.redirect_url !== "string" || !requestBody.redirect_url.trim()) {
    throw new Error(
      "HashKey reusable order needs redirect_url: set HASHKEY_REDIRECT_URL or BASE_URL in .env (see .env.example)",
    );
  }
  const body = canonicalStringify(requestBody as object);

  const headers = buildHmacHeaders({
    method: "POST",
    path: HSK_REUSABLE_PATH,
    query: "",
    body,
    appKey,
    appSecret,
  });

  const res = await fetch(`${baseUrl}${HSK_REUSABLE_PATH}`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HashKey API error ${res.status}: ${text}`);

  let data: ReusableOrderResponse;
  try {
    data = JSON.parse(text) as ReusableOrderResponse;
  } catch {
    throw new Error("HashKey API returned non-JSON response");
  }

  return {
    paymentUrl: data.data?.payment_url ?? "",
    paymentRequestId: data.data?.payment_request_id ?? "",
    cartMandateId: contents.id,
    raw: data,
  };
}
