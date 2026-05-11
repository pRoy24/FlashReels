"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CreditCard,
  History,
  Loader2,
  ReceiptText,
  RefreshCcw,
  WalletCards,
} from "lucide-react";

interface BillingDashboard {
  user: {
    id: string;
    email: string;
    displayName: string;
    role?: "admin" | "user";
    isAdmin?: boolean;
    hasExternalApiKey?: boolean;
  };
  billing: {
    remainingCredits?: number;
    lastTopUp?: {
      amountPaidCents?: number;
      currency?: string;
      creditsApplied?: number;
      paymentDate?: string;
      hostedInvoiceUrl?: string;
      receiptUrl?: string | null;
      productSummary?: string;
    } | null;
    externalUser?: {
      generationCredits?: number;
      totalRequests?: number;
      totalCreditsUsed?: number;
      totalCreditsRefunded?: number;
      totalCreditsPurchased?: number;
      lastRequestAt?: string | null;
      lastPurchaseAt?: string | null;
      hasExternalApiKey?: boolean;
    } | null;
  };
  audit: {
    error?: string;
    requests: Array<{
      requestId: string;
      routeKey?: string | null;
      status?: string | null;
      prompt?: string | null;
      videoUrl?: string | null;
      imageCount?: number;
      creditsCharged?: number;
      creditsRefunded?: number;
      remainingCredits?: number | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    }>;
  };
}

interface RechargeResponse {
  url: string;
  credits: number;
  amountUsd: number;
}

class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function readApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiRequestError(data?.message || "Request failed", response.status);
  }
  return data as T;
}

function formatCredits(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  return new Intl.NumberFormat().format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatMoney(cents: number | undefined, currency = "usd") {
  if (typeof cents !== "number" || !Number.isFinite(cents)) {
    return "";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((cents || 0) / 100);
}

export default function BillingPage() {
  const [dashboard, setDashboard] = useState<BillingDashboard | null>(null);
  const [credits, setCredits] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [recharging, setRecharging] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  const externalUser = dashboard?.billing.externalUser || null;
  const lastTopUp = dashboard?.billing.lastTopUp || null;
  const totalUsed = externalUser?.totalCreditsUsed || 0;
  const totalPurchased = externalUser?.totalCreditsPurchased || 0;
  const netUsed = Math.max(0, totalUsed - (externalUser?.totalCreditsRefunded || 0));
  const spendLabel = useMemo(() => (
    lastTopUp ? formatMoney(lastTopUp.amountPaidCents, lastTopUp.currency) : ""
  ), [lastTopUp]);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    setAuthRequired(false);
    try {
      const data = await readApi<BillingDashboard>("/api/billing");
      setDashboard(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load billing.");
      setAuthRequired(loadError instanceof ApiRequestError && loadError.status === 401);
    } finally {
      setLoading(false);
    }
  }

  async function startRecharge() {
    setRecharging(true);
    setError("");
    setAuthRequired(false);
    try {
      const data = await readApi<RechargeResponse>("/api/billing/recharge", {
        method: "POST",
        body: JSON.stringify({ credits }),
      });
      window.location.assign(data.url);
    } catch (rechargeError) {
      setError(rechargeError instanceof Error ? rechargeError.message : "Unable to start recharge.");
      setAuthRequired(rechargeError instanceof ApiRequestError && rechargeError.status === 401);
      setRecharging(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="appShell billingShell">
      <header className="appTopbar">
        <Link className="brandBlock" href="/app">
          <ArrowLeft size={18} />
          <div>
            <strong>FlashReels</strong>
            <span>Billing</span>
          </div>
        </Link>

        <div className="topbarActions">
          <button className="feedNavPill" type="button" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />}
            Refresh
          </button>
          <Link className="feedNavPill" href="/app">
            Studio
          </Link>
        </div>
      </header>

      <section className="billingSurface">
        <div className="billingHeader">
          <div>
            <p className="eyebrow">External user accounting</p>
            <h1>Credits, audit, and recharge</h1>
          </div>
          {dashboard?.user ? (
            <div className="accountChip billingAccountChip">
              <strong>{dashboard.user.displayName}</strong>
              <span>{dashboard.user.email}</span>
            </div>
          ) : null}
        </div>

        {error ? <div className="errorBox">{error}</div> : null}

        {loading && !dashboard ? (
          <div className="billingLoading">
            <Loader2 className="spin" />
          </div>
        ) : error && !dashboard ? (
          <section className="billingPanel">
            <div className="billingPanelHeader">
              <div>
                <h2>{authRequired ? "Login required" : "Billing unavailable"}</h2>
                <p>
                  {authRequired
                    ? "Sign in to FlashReels before viewing external-user credits and Stripe recharge history."
                    : "FlashReels could not load the external-user billing dashboard."}
                </p>
              </div>
              <WalletCards size={20} />
            </div>
            {authRequired ? (
              <Link className="primaryButton" href="/app">
                Go to login
              </Link>
            ) : (
              <button className="primaryButton" type="button" onClick={loadDashboard}>
                Retry
              </button>
            )}
          </section>
        ) : (
          <>
            <div className="billingMetricGrid">
              <article className="billingMetric">
                <WalletCards size={20} />
                <span>Available</span>
                <strong>{formatCredits(dashboard?.billing.remainingCredits)} credits</strong>
              </article>
              <article className="billingMetric">
                <ReceiptText size={20} />
                <span>Purchased</span>
                <strong>{formatCredits(totalPurchased)} credits</strong>
              </article>
              <article className="billingMetric">
                <History size={20} />
                <span>Used</span>
                <strong>{formatCredits(netUsed)} credits</strong>
              </article>
              <article className="billingMetric">
                <Check size={20} />
                <span>Requests</span>
                <strong>{formatCredits(externalUser?.totalRequests)} total</strong>
              </article>
            </div>

            <div className="billingGrid">
              <section className="billingPanel rechargePanel">
                <div className="billingPanelHeader">
                  <div>
                    <h2>Recharge</h2>
                    <p>Stripe checkout credits this FlashReels user while charging the deployed Samsar account.</p>
                  </div>
                  <CreditCard size={20} />
                </div>
                <label>
                  <span>Credits to add</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={credits}
                    onChange={(event) => setCredits(Number(event.target.value))}
                  />
                </label>
                <div className="rechargeQuickAmounts">
                  {[500, 1000, 2500, 5000].map((amount) => (
                    <button
                      key={amount}
                      className={credits === amount ? "active" : ""}
                      type="button"
                      onClick={() => setCredits(amount)}
                    >
                      {formatCredits(amount)}
                    </button>
                  ))}
                </div>
                <button className="primaryButton" type="button" onClick={startRecharge} disabled={recharging || credits <= 0}>
                  {recharging ? <Loader2 className="spin" size={17} /> : <CreditCard size={17} />}
                  Open Stripe checkout
                </button>
              </section>

              <section className="billingPanel">
                <div className="billingPanelHeader">
                  <div>
                    <h2>Last payment</h2>
                    <p>{lastTopUp ? formatDate(lastTopUp.paymentDate) : "No completed recharge found."}</p>
                  </div>
                  <ReceiptText size={20} />
                </div>
                {lastTopUp ? (
                  <div className="paymentSummary">
                    <div>
                      <span>Amount</span>
                      <strong>{spendLabel || "Recorded"}</strong>
                    </div>
                    <div>
                      <span>Credits</span>
                      <strong>{formatCredits(lastTopUp.creditsApplied)}</strong>
                    </div>
                    {lastTopUp.hostedInvoiceUrl || lastTopUp.receiptUrl ? (
                      <a href={lastTopUp.hostedInvoiceUrl || lastTopUp.receiptUrl || ""} target="_blank" rel="noreferrer">
                        Open receipt
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            <section className="billingPanel auditPanel">
              <div className="billingPanelHeader">
                <div>
                  <h2>Credit audit</h2>
                  <p>Recent Samsar requests attributed to this external user.</p>
                </div>
                <History size={20} />
              </div>
              {dashboard?.audit.error ? <div className="errorBox">{dashboard.audit.error}</div> : null}
              <div className="auditTable">
                <div className="auditRow auditHead">
                  <span>Request</span>
                  <span>Status</span>
                  <span>Route</span>
                  <span>Credits</span>
                  <span>Created</span>
                </div>
                {dashboard?.audit.requests.length ? dashboard.audit.requests.map((request) => (
                  <div className="auditRow" key={request.requestId || `${request.createdAt}-${request.routeKey}`}>
                    <span title={request.prompt || request.requestId}>{request.requestId || "Request"}</span>
                    <span>{request.status || "Unknown"}</span>
                    <span>{request.routeKey || "Samsar"}</span>
                    <span>{formatCredits(request.creditsCharged)}</span>
                    <span>{formatDate(request.createdAt)}</span>
                  </div>
                )) : (
                  <div className="auditEmpty">No external-user usage has been recorded yet.</div>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
