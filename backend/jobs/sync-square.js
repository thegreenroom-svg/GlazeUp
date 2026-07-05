/**
 * GlazeUp Square Sync Job
 * Pulls transaction and customer data from Square, computes analytics
 * Run hourly via cron, or manually triggered
 */

export async function syncSquareData(studioId, supabase, squareClient) {
  let logId;

  try {
    // Create sync log entry
    const { data: log } = await supabase
      .from('sync_logs')
      .insert({
        studio_id: studioId,
        sync_type: 'transactions',
        status: 'pending'
      })
      .select()
      .single();

    logId = log.id;

    // Mark as syncing
    await supabase
      .from('square_connections')
      .update({ sync_status: 'syncing' })
      .eq('studio_id', studioId);

    // Get Square credentials
    const { data: conn, error: connErr } = await supabase
      .from('square_connections')
      .select('square_access_token, square_merchant_id, last_sync_at')
      .eq('studio_id', studioId)
      .single();

    if (connErr || !conn) throw new Error('Studio not connected to Square');

    // Fetch transactions from Square
    // Start from last sync time, or 7 days ago if first sync
    const beginTime = conn.last_sync_at
      ? new Date(conn.last_sync_at).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const transactions = await fetchSquareTransactions(
      squareClient,
      conn.square_merchant_id,
      beginTime
    );

    // Fetch customers
    const customers = await fetchSquareCustomers(squareClient, conn.square_merchant_id);

    // Aggregate by date
    const dailyData = aggregateByDate(transactions);

    // Compute analytics for each day
    for (const [date, data] of Object.entries(dailyData)) {
      const { total_revenue, transaction_count } = data;

      // Try to infer app users (idealized: count of unique customer emails)
      // In practice, you'd need to mark transactions as "app-generated" in Square notes
      const appUsers = Math.round(transaction_count * 0.3); // placeholder

      // Upsert daily analytics
      await supabase
        .from('studio_analytics')
        .upsert({
          studio_id: studioId,
          metric_date: date,
          total_revenue,
          transaction_count,
          app_users_count: appUsers
        }, { onConflict: 'studio_id,metric_date' });
    }

    // Update sync status
    await supabase
      .from('square_connections')
      .update({
        sync_status: 'idle',
        last_sync_at: new Date().toISOString()
      })
      .eq('studio_id', studioId);

    // Log success
    await supabase
      .from('sync_logs')
      .update({
        status: 'success',
        records_synced: transactions.length,
        completed_at: new Date()
      })
      .eq('id', logId);

    console.log(`✓ Synced ${transactions.length} transactions for studio ${studioId}`);
    return { success: true, recordsCount: transactions.length };
  } catch (err) {
    console.error(`✗ Sync error for studio ${studioId}:`, err);

    // Mark connection as errored
    await supabase
      .from('square_connections')
      .update({
        sync_status: 'error',
        sync_error: err.message
      })
      .eq('studio_id', studioId);

    // Log error
    if (logId) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'error',
          error_message: err.message,
          completed_at: new Date()
        })
        .eq('id', logId);
    }

    throw err;
  }
}

/**
 * Fetch all transactions from Square for a merchant
 * between beginTime and now
 */
async function fetchSquareTransactions(squareClient, merchantId, beginTime) {
  const transactions = [];
  let cursor;

  try {
    while (true) {
      const response = await squareClient.transactionsApi.listTransactions(
        merchantId,
        {
          beginTime,
          endTime: new Date().toISOString(),
          cursor
        }
      );

      if (response.result.transactions) {
        transactions.push(...response.result.transactions);
      }

      if (!response.result.cursor) break;
      cursor = response.result.cursor;
    }

    return transactions;
  } catch (err) {
    console.error('Square transaction fetch error:', err);
    throw new Error(`Failed to fetch Square transactions: ${err.message}`);
  }
}

/**
 * Fetch all customers from Square
 */
async function fetchSquareCustomers(squareClient, merchantId) {
  const customers = [];
  let cursor;

  try {
    while (true) {
      const response = await squareClient.customersApi.listCustomers(cursor);

      if (response.result.customers) {
        customers.push(...response.result.customers);
      }

      if (!response.result.cursor) break;
      cursor = response.result.cursor;
    }

    return customers;
  } catch (err) {
    console.error('Square customer fetch error:', err);
    throw new Error(`Failed to fetch Square customers: ${err.message}`);
  }
}

/**
 * Aggregate transaction data by date
 */
function aggregateByDate(transactions) {
  const daily = {};

  transactions.forEach(txn => {
    if (!txn.receipt || !txn.receipt.receipt_number) return; // skip failed txns

    const date = txn.created_at.split('T')[0]; // YYYY-MM-DD
    const amount = txn.total_money?.amount || 0; // in cents

    if (!daily[date]) {
      daily[date] = { total_revenue: 0, transaction_count: 0 };
    }

    daily[date].total_revenue += amount / 100; // convert to pounds/dollars
    daily[date].transaction_count += 1;
  });

  return daily;
}

export default syncSquareData;
