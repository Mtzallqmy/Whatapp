import { query } from './index.js'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function addMessage(userId: string, role: ConversationMessage['role'], content: string, messageType = 'text'): Promise<void> {
  await query(
    'INSERT INTO conversation_messages (user_id, role, content, message_type) VALUES ($1, $2, $3, $4)',
    [userId, role, String(content).slice(0, 30_000), messageType]
  )
}

export async function recentMessages(userId: string, limit: number): Promise<ConversationMessage[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  const { rows } = await query<ConversationMessage>(`
    SELECT role, content FROM (
      SELECT role, content, created_at, id
      FROM conversation_messages
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    ) x ORDER BY created_at ASC
  `, [userId, safeLimit])
  return rows
}

export async function resetConversation(userId: string): Promise<void> {
  await query('DELETE FROM conversation_messages WHERE user_id = $1', [userId])
}
