// GET /billing/status — the logged-in user's current plan ('free' | 'pro') and
// whether billing is configured on this deployment at all.
import { requireAuth } from '../../lib/auth.js';
import { methodGuard } from '../../lib/http.js';
import { getPlan, billingEnabled } from '../../lib/billing.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  const session = requireAuth(req, res, 'session');
  if (!session) return;
  res.json({ plan: await getPlan(session.sub), billingEnabled });
}
