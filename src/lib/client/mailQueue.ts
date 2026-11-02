/**
 * Ask the server to send the emails the database just queued (a Help desk
 * reply, a payout change — 20261108000000_email_outbox.sql), instead of
 * waiting for the daily run. Fire and forget: the email is queued either way.
 */
export function sendQueuedEmails(): void {
  void fetch('/api/email/flush', { method: 'POST', keepalive: true }).catch(() => {});
}
