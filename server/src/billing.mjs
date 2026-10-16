export const seconds = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const id = value => typeof value === 'string' ? value : value?.id;
export function entitlement(subscriptions, now = Date.now() / 1000) {
  const paid = subscriptions.find(s => !s.blocked &&
    (['active', 'past_due'].includes(s.status)) &&
    (seconds(s.paid_through) > now || s.status === 'past_due' && seconds(s.grace_until) > now));
  return { plan: paid ? 'paid' : 'free', benefits: { cloudPlus: Boolean(paid) },
    status: paid?.status || 'free', validUntil: paid ? Math.max(seconds(paid.paid_through), seconds(paid.grace_until)) : null,
    cancelAtPeriodEnd: Boolean(paid?.cancel_at_period_end) };
}
export function createBilling({ repo, stripe, priceId, mode = 'test', graceDays = 3, siteURL }) {
  async function checkout(user) {
    return repo.lockUser(user.id, async tx => {
      if (await tx.deleting(user.id)) throw Object.assign(new Error('Conta em exclusão.'), { status: 409 });
      let customer = await tx.customer(user.id);
      if (!customer) {
        customer = (await stripe.customers.create({ metadata: { atlas_user_id: user.id } }, { idempotencyKey: `atlas-customer-${mode}-${user.id}` })).id;
        await tx.saveCustomer(user.id, customer);
      }
      const subscriptions = await tx.subscriptions(user.id);
      if (subscriptions.some(s => !['canceled', 'incomplete_expired'].includes(s.status)))
        throw Object.assign(new Error('Já existe uma assinatura. Use Gerenciar assinatura.'), { status: 409 });
      const result = await stripe.checkout.sessions.create({ mode: 'subscription', customer,
        line_items: [{ price: priceId, quantity: 1 }], payment_method_types: ['card'],
        subscription_data: { metadata: { atlas_user_id: user.id } },
        success_url: new URL('?billing=success', siteURL).href,
        cancel_url: new URL('?billing=cancel', siteURL).href },
        { idempotencyKey: `atlas-checkout-${mode}-${user.id}-${Math.floor(Date.now() / 1800000)}` });
      return { url: result.url };
    });
  }
  async function portal(user) {
    const customer = await repo.customer(user.id);
    if (!customer) throw Object.assign(new Error('Esta conta ainda não possui assinatura.'), { status: 409 });
    return { url: (await stripe.billingPortal.sessions.create({ customer, return_url: siteURL })).url };
  }
  async function webhook(event) {
    if (event.livemode !== (mode === 'live')) throw Object.assign(new Error('Modo de pagamento incorreto.'), { status: 400 });
    const object = event.data.object;
    const supported = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
      'invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'charge.dispute.created'];
    if (!supported.includes(event.type)) return { ignored: true };
    const customer = id(object.customer) || (event.type === 'charge.dispute.created' ? id((await stripe.charges.retrieve(id(object.charge))).customer) : null);
    const userId = customer && await repo.userForCustomer(customer);
    // Retry unlinked events: acknowledge only after checkout's customer transaction is visible.
    if (!userId) throw Object.assign(new Error('Cliente ainda não vinculado.'), { status: 503 });
    return repo.lockUser(userId, async tx => {
      if (await tx.eventSeen(event.id)) return { duplicate: true };
      if (await tx.deleting(userId)) { await tx.recordEvent(event); return { ignored: true }; }
      if (['charge.refunded', 'charge.dispute.created'].includes(event.type)) {
        const charge = event.type === 'charge.refunded' ? object : await stripe.charges.retrieve(id(object.charge));
        if (event.type === 'charge.dispute.created' || seconds(charge.amount_refunded) > 0)
          await tx.blockInvoice(userId, id(charge.invoice));
      } else {
        const subscriptionId = event.type.startsWith('customer.subscription.') ? object.id : id(object.subscription || object.parent?.subscription_details?.subscription);
        if (subscriptionId) {
          // Always fetch canonical state under the customer lock: delayed events cannot roll it back.
          const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
          if (id(sub.customer) !== customer) throw new Error('Assinatura pertence a outro cliente.');
          const old = (await tx.subscriptions(userId)).find(s => s.subscription_id === sub.id);
          const invoice = typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
          const allowed = sub.items?.data?.length === 1 && sub.items.data[0].price.id === priceId;
          const paidInvoice = allowed && invoice?.status === 'paid' && seconds(invoice.amount_paid) > 0 && invoice.currency === 'brl';
          let paidThrough = seconds(old?.paid_through), invoiceId = old?.invoice_id || null, blocked = Boolean(old?.blocked);
          if (paidInvoice) {
            const period = seconds(sub.current_period_end || sub.items.data[0].current_period_end);
            if (invoice.id !== invoiceId && period > paidThrough) { paidThrough = period; invoiceId = invoice.id; blocked = false; }
          }
          if (!allowed) blocked = true;
          const status = sub.status;
          // Grace is anchored to the last paid period, never extended by repeated failed events.
          const graceUntil = status === 'past_due' && paidThrough ? paidThrough + graceDays * 86400 : 0;
          await tx.saveSubscription({ user_id: userId, subscription_id: sub.id, status, paid_through: paidThrough,
            grace_until: graceUntil, invoice_id: invoiceId, blocked, cancel_at_period_end: Boolean(sub.cancel_at_period_end) });
        }
      }
      await tx.recordEvent(event); // same transaction as benefits; failure rolls everything back
      return { received: true };
    });
  }
  return { checkout, portal, webhook, plan: async user => ({ ...entitlement(await repo.subscriptions(user.id)), mode }) };
}
