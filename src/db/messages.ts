import { query } from './index.js'

export async function claimIncomingMessage(messageId: string, remoteJid: string): Promise<boolean> {
  if (!messageId) return true
  const { rowCount } = await query(`
    INSERT INTO processed_messages (message_id, remote_jid) VALUES ($1, $2)
    ON CONFLICT (message_id) DO NOTHING
  `, [messageId, remoteJid])
  if (Math.random() < 0.01) {
    query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '14 days'").catch(() => undefined)
  }
  return Boolean(rowCount)
}
