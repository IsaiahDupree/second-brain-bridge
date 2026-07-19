// POST /billing/portal — open the Stripe customer portal to manage/cancel the
// subscription. Auth: the logged-in session. Returns { url }.
import { requireAuth } from '../../lib/auth.js';
import { methodGuard, baseUrl } from '../../lib/http.js';
import { createPortalSession } from '../../lib/billing.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const session = requireAuth(req, res, 'session');
  if (!session) return;
  try {
    const url = await createPortalSession(session.sub, baseUrl(req));
    res.json({ url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
