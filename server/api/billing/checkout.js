// POST /billing/checkout — start a Stripe Checkout for the Pro subscription.
// Auth: the logged-in session. Returns { url } to redirect the user to.
import { requireAuth } from '../../lib/auth.js';
import { methodGuard, baseUrl } from '../../lib/http.js';
import { createCheckoutSession } from '../../lib/billing.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const session = requireAuth(req, res, 'session');
  if (!session) return;
  try {
    const url = await createCheckoutSession(session.sub, session.email, baseUrl(req));
    res.json({ url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
