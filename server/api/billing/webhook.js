// POST /billing/webhook — Stripe subscription lifecycle events. No user auth;
// authenticity is the Stripe signature over the RAW body (so bodyParser is off).
import { verifyWebhook, applyEvent } from '../../lib/billing.js';

export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let event;
  try {
    const buf = await rawBody(req);
    event = verifyWebhook(buf, req.headers['stripe-signature']);
  } catch (e) {
    return res.status(400).send(`Webhook signature error: ${e.message}`);
  }
  try {
    await applyEvent(event);
  } catch (e) {
    // Return 200 anyway so Stripe doesn't retry forever on our own bug; the next
    // subscription event will reconcile the plan.
    console.error('billing webhook apply error:', e.message);
  }
  res.json({ received: true });
}
