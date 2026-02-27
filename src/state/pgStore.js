const { pool } = require('../services/db');
const memoryStore = require('./memoryStore');

function key(tenantId, from) {
  return `${tenantId}:${from}`;
}

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

async function ensureContact(waId) {
  await pool.query(
    `insert into contacts (wa_id, last_seen_at)
     values ($1, now())
     on conflict (wa_id) do update
       set last_seen_at = now()`,
    [waId],
  );
}

function createPgStore() {
  return {
    async getState(tenantId, from) {
      const fallback = memoryStore.getState(tenantId, from);
      if (!hasDatabase()) return fallback;

      try {
        const { rows } = await pool.query(
          'select state from conversation_state where wa_id = $1',
          [key(tenantId, from)],
        );
        const persisted = rows[0]?.state;
        if (!persisted || typeof persisted !== 'object') return fallback;
        return { ...fallback, ...persisted };
      } catch {
        return fallback;
      }
    },

    async setState(tenantId, from, patch) {
      const current = await this.getState(tenantId, from);
      const next = { ...current, ...patch };
      memoryStore.setState(tenantId, from, patch);
      if (!hasDatabase()) return;

      try {
        const waId = key(tenantId, from);
        await ensureContact(waId);
        await pool.query(
          `insert into conversation_state (wa_id, state, updated_at)
           values ($1, $2, now())
           on conflict (wa_id) do update
             set state = excluded.state,
                 updated_at = now()`,
          [waId, next],
        );
      } catch {
        // Keep request flow running even if persistence fails.
      }
    },

    async clearBooking(tenantId, from) {
      const current = await this.getState(tenantId, from);
      const next = { ...current, booking: null };
      memoryStore.clearBooking(tenantId, from);
      if (!hasDatabase()) return;

      try {
        const waId = key(tenantId, from);
        await ensureContact(waId);
        await pool.query(
          `insert into conversation_state (wa_id, state, updated_at)
           values ($1, $2, now())
           on conflict (wa_id) do update
             set state = excluded.state,
                 updated_at = now()`,
          [waId, next],
        );
      } catch {
        // Keep request flow running even if persistence fails.
      }
    },

    async getHistory(tenantId, from) {
      return memoryStore.getHistory(tenantId, from);
    },

    async pushHistory(tenantId, from, role, content) {
      memoryStore.pushHistory(tenantId, from, role, content);
    },

    async dedupeSeen(id) {
      return memoryStore.dedupeSeen(id);
    },
  };
}

module.exports = { createPgStore };
