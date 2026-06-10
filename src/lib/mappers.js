export function formatCreated(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function rowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.proposed_date || '',
    time: row.proposed_time ? String(row.proposed_time).slice(0, 5) : '',
    desc: row.description || '',
    priority: row.priority,
    status: row.status,
    author: row.author_key,
    authorId: row.author_id,
    created: formatCreated(row.created_at),
  };
}

export function rowToMessage(row) {
  return {
    id: row.id,
    userKey: row.user_key,
    text: row.body,
    ts: formatMessageTime(row.created_at),
  };
}

export function rowToLog(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    decreto_id: row.decreto_id,
    decreto_title: row.decreto_title,
    decreto_type: row.decreto_type,
    decreto_priority: row.decreto_priority,
    event_type: row.event_type,
    actor_key: row.actor_key,
    ts: formatCreated(row.created_at),
  };
}
