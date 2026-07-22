// billing.js — reusable Stripe subscription layer for the connector relay.
// A user's plan ('free' | 'pro') is derived from their Stripe subscription and
// cached in storage; MCP tools gate Pro features on getPlan(userId). Test mode
// works exactly the same as live — only the keys differ. No-ops cleanly when
// STRIPE_SECRET_KEY is unset (self-hosters / local dev run everything as 'pro').

import Stripe from 'stripe';
import { redis } from './redis.js';
import { hasCommandCenter, emailForUser } from './commandCenter.js';

const KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_PRO = process.env.STRIPE_PRICE_PRO;
export const billingEnabled = !!(KEY && PRICE_PRO);
const stripe = KEY ? new Stripe(KEY, { apiVersion: '2024-06-20' }) : null;

const planKey = (u) => `plan:${u}`;
const custKey = (u) => `stripe_customer:${u}`;
const byCustKey = (c) => `stripe_user:${c}`;

// When billing is not configured, every account is Pro (self-host / dev).
export async function getPlan(userId) {
  // Command Center bundle: one subscription grants Pro across every connector.
  const ccEmail = await emailForUser(userId);
  if (ccEmail && (await hasCommandCenter(ccEmail))) return 'pro';
  if (!billingEnabled) return 'pro';
  return (await redis.get(planKey(userId))) === 'pro' ? 'pro' : 'free';
}
export const isPro = async (userId) => (await getPlan(userId)) === 'pro';
async function setPlan(userId, plan) {
  await redis.set(planKey(userId), plan === 'pro' ? 'pro' : 'free');
}

async function ensureCustomer(userId, email) {
  const existing = await redis.get(custKey(userId));
  if (existing) return existing;
  const c = await stripe.customers.create({ email: email || undefined, metadata: { userId } });
  await redis.set(custKey(userId), c.id);
  await redis.set(byCustKey(c.id), userId);
  return c.id;
}

export async function createCheckoutSession(userId, email, base) {
  if (!billingEnabled) throw new Error('Billing is not configured.');
  const customer = await ensureCustomer(userId, email);
  const s = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: PRICE_PRO, quantity: 1 }],
    success_url: `${base}/upgrade?status=success`,
    cancel_url: `${base}/upgrade?status=cancelled`,
    allow_promotion_codes: true,
    client_reference_id: userId,
  });
  return s.url;
}

export async function createPortalSession(userId, base) {
  if (!billingEnabled) throw new Error('Billing is not configured.');
  const customer = await redis.get(custKey(userId));
  if (!customer) throw new Error('No subscription to manage yet — upgrade first.');
  const s = await stripe.billingPortal.sessions.create({ customer, return_url: `${base}/upgrade` });
  return s.url;
}

export function verifyWebhook(rawBody, sig) {
  return stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
}

// Reconcile a Stripe event into our stored plan. Idempotent — safe to replay.
export async function applyEvent(event) {
  const obj = event.data?.object || {};
  const fromSub = async (sub) => {
    const userId = (await redis.get(byCustKey(sub.customer))) || sub.metadata?.userId;
    if (!userId) return;
    const active = ['active', 'trialing', 'past_due'].includes(sub.status);
    await setPlan(userId, active ? 'pro' : 'free');
  };
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.subscription) await fromSub(await stripe.subscriptions.retrieve(obj.subscription));
      else if (obj.client_reference_id) await setPlan(obj.client_reference_id, 'pro');
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await fromSub(obj);
      break;
    default:
      break;
  }
}
