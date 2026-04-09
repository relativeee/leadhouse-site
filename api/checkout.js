/**
 * api/checkout.js
 * Vercel serverless function — cria sessao de checkout do Stripe.
 *
 * Como usar no frontend:
 *   GET /api/checkout?plan=start
 *   GET /api/checkout?plan=pro
 *   GET /api/checkout?plan=elite
 *
 * Variaveis de ambiente necessarias na Vercel:
 *   STRIPE_SECRET_KEY        — sk_live_... ou sk_test_...
 *   STRIPE_START_PRICE_ID    — price_...
 *   STRIPE_PRO_PRICE_ID      — price_...
 *   STRIPE_ELITE_PRICE_ID    — price_...
 *   SITE_URL                 — https://leadhouse-site.vercel.app (opcional, default = host da request)
 */

const Stripe = require('stripe');

const PRICE_MAP = {
  start: process.env.STRIPE_START_PRICE_ID,
  pro:   process.env.STRIPE_PRO_PRICE_ID,
  elite: process.env.STRIPE_ELITE_PRICE_ID,
};

// Trial gratis de 14 dias por plano (ajuste se quiser)
const TRIAL_DAYS = {
  start: 0,
  pro:   0,
  elite: 14,
};

module.exports = async (req, res) => {
  try {
    // Le o plan tanto via req.query quanto parseando a URL (fallback)
    let plan = '';
    if (req.query && req.query.plan) {
      plan = String(req.query.plan).toLowerCase();
    } else if (req.url) {
      const u = new URL(req.url, 'http://localhost');
      plan = (u.searchParams.get('plan') || '').toLowerCase();
    }

    if (!plan || !PRICE_MAP[plan]) {
      return res.status(400).json({
        erro: 'Plano invalido. Use ?plan=start | pro | elite',
      });
    }

    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      return res.status(503).json({
        erro: `Plano ${plan} ainda nao configurado. Defina STRIPE_${plan.toUpperCase()}_PRICE_ID nas variaveis de ambiente.`,
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        erro: 'Stripe nao configurado. Defina STRIPE_SECRET_KEY nas variaveis de ambiente.',
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = process.env.SITE_URL || `${proto}://${host}`;

    // E-mail opcional via query (?email=usuario@x.com) — se vier do dashboard
    const emailParam = req.query?.email || (req.url ? new URL(req.url, 'http://x').searchParams.get('email') : null);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: TRIAL_DAYS[plan] > 0 ? { trial_period_days: TRIAL_DAYS[plan], metadata: { plan } } : { metadata: { plan } },
      success_url: `${baseUrl}/sucesso.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/cancelado.html`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'pt-BR',
      customer_email: emailParam || undefined,
      metadata: { plan },
    });

    res.writeHead(303, { Location: session.url });
    res.end();
  } catch (err) {
    console.error('[checkout] erro:', err);
    res.status(500).json({ erro: err.message || 'Erro ao criar checkout' });
  }
};
