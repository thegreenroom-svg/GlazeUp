import express from 'express';

const router = express.Router();

/**
 * POST /api/stripe/create-subscription
 * Create a Stripe subscription for a studio
 */
router.post('/create-subscription', async (req, res) => {
  const { studioId, email, planTier } = req.body;
  const supabase = req.app.locals.supabase;
  const stripe = req.app.locals.stripe;

  if (!studioId || !email || !planTier) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const priceMap = {
    'starter': process.env.STRIPE_PRICE_STARTER,    // £29/month
    'pro': process.env.STRIPE_PRICE_PRO,            // £59/month
    'enterprise': process.env.STRIPE_PRICE_ENTERPRISE // custom
  };

  const priceId = priceMap[planTier];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan tier' });

  try {
    // Create or get customer
    const { data: studio } = await supabase
      .from('studios')
      .select('stripe_customer_id')
      .eq('id', studioId)
      .single();

    let customerId = studio?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('studios')
        .update({ stripe_customer_id: customerId })
        .eq('id', studioId);
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });

    // Store subscription ID
    await supabase
      .from('studios')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: 'active'
      })
      .eq('id', studioId);

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret
    });
  } catch (err) {
    console.error('Subscription creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe events (invoice.payment_succeeded, invoice.payment_failed, etc.)
 */
router.post('/webhook', async (req, res) => {
  const stripe = req.app.locals.stripe;
  const supabase = req.app.locals.supabase;
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,  // must be raw buffer, not parsed JSON
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook sig verification failed:', err.message);
    return res.sendStatus(400);
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        const { customer, subscription } = event.data.object;
        // Update subscription status
        await supabase
          .from('studios')
          .update({ subscription_status: 'active' })
          .eq('stripe_customer_id', customer);
        break;

      case 'invoice.payment_failed':
        const customer2 = event.data.object.customer;
        // Update subscription status
        await supabase
          .from('studios')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customer2);
        break;

      case 'customer.subscription.deleted':
        const sub = event.data.object;
        await supabase
          .from('studios')
          .update({ subscription_status: 'cancelled' })
          .eq('stripe_subscription_id', sub.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stripe/subscription/:studioId
 * Get subscription status
 */
router.get('/subscription/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;
  const stripe = req.app.locals.stripe;

  const { data: studio, error } = await supabase
    .from('studios')
    .select('stripe_subscription_id, subscription_status')
    .eq('id', studioId)
    .single();

  if (error || !studio?.stripe_subscription_id) {
    return res.status(404).json({ error: 'No subscription found' });
  }

  const subscription = await stripe.subscriptions.retrieve(
    studio.stripe_subscription_id
  );

  res.json({
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    items: subscription.items.data.map(item => ({
      priceId: item.price.id,
      amount: item.price.unit_amount,
      currency: item.price.currency,
      interval: item.price.recurring?.interval
    }))
  });
});

/**
 * POST /api/stripe/cancel/:studioId
 * Cancel a subscription
 */
router.post('/cancel/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;
  const stripe = req.app.locals.stripe;

  const { data: studio } = await supabase
    .from('studios')
    .select('stripe_subscription_id')
    .eq('id', studioId)
    .single();

  if (!studio?.stripe_subscription_id) {
    return res.status(404).json({ error: 'No subscription found' });
  }

  const subscription = await stripe.subscriptions.del(
    studio.stripe_subscription_id
  );

  await supabase
    .from('studios')
    .update({ subscription_status: 'cancelled' })
    .eq('id', studioId);

  res.json({ success: true, subscriptionId: subscription.id });
});

export default router;
