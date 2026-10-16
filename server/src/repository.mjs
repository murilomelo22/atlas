export class Repository {
  constructor(db) { this.db = db; }
  async lockUser(user, fn) {
    const db = await this.db.connect();
    try {
      await db.query('begin');
      await db.query("select pg_advisory_xact_lock(hashtextextended('commercial:' || $1,0))", [user]);
      const result = await fn(new Repository(db)); await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  }
  async customer(user) { return (await this.db.query('select customer_id from atlas_commercial.accounts where user_id=$1', [user])).rows[0]?.customer_id; }
  async userForCustomer(customer) { return (await this.db.query('select user_id from atlas_commercial.accounts where customer_id=$1', [customer])).rows[0]?.user_id; }
  async saveCustomer(user, customer) { await this.db.query('insert into atlas_commercial.accounts(user_id,customer_id) values($1,$2)', [user, customer]); }
  async deleting(user) { return Boolean((await this.db.query('select 1 from atlas_commercial.accounts where user_id=$1 and deletion_requested_at is not null', [user])).rows.length); }
  async subscriptions(user) { return (await this.db.query('select * from atlas_commercial.subscriptions where user_id=$1', [user])).rows; }
  async eventSeen(event) { return Boolean((await this.db.query('select 1 from atlas_commercial.events where event_id=$1', [event])).rows.length); }
  async recordEvent(event) { await this.db.query('insert into atlas_commercial.events(event_id,type) values($1,$2)', [event.id, event.type]); }
  async blockInvoice(user, invoice) {
    await this.db.query('insert into atlas_commercial.revocations(user_id,invoice_id) values($1,$2) on conflict do nothing', [user, invoice || '*']);
    // If the provider cannot link the charge, fail closed for this customer's subscriptions.
    await this.db.query('update atlas_commercial.subscriptions set blocked=true where user_id=$1 and ($2::text is null or invoice_id=$2)', [user, invoice]);
  }
  async saveSubscription(s) {
    const revoked = await this.db.query("select 1 from atlas_commercial.revocations where user_id=$1 and invoice_id in ($2,'*')", [s.user_id,s.invoice_id]);
    s.blocked ||= revoked.rows.length > 0;
    await this.db.query(`insert into atlas_commercial.subscriptions(user_id,subscription_id,status,paid_through,grace_until,invoice_id,blocked,cancel_at_period_end)
      values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(subscription_id) do update set status=excluded.status,
      paid_through=excluded.paid_through,grace_until=excluded.grace_until,invoice_id=excluded.invoice_id,
      blocked=excluded.blocked,cancel_at_period_end=excluded.cancel_at_period_end`,
    [s.user_id,s.subscription_id,s.status,s.paid_through,s.grace_until,s.invoice_id,s.blocked,s.cancel_at_period_end]);
  }
}
