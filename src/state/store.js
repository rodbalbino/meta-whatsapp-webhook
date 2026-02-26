const historyMap = new Map();
const stateMap = new Map();
const processedMessageIds = new Set();

const MAX_HISTORY = 12;
const MAX_DEDUPE_SIZE = 5000;

function key(tenantId, from) {
  return `${tenantId}:${from}`;
}

function getState(tenantId, from) {
  return stateMap.get(key(tenantId, from)) || { handoff: false, booking: null };
}

function setState(tenantId, from, patch) {
  const current = getState(tenantId, from);
  stateMap.set(key(tenantId, from), { ...current, ...patch });
}

function clearBooking(tenantId, from) {
  const current = getState(tenantId, from);
  stateMap.set(key(tenantId, from), { ...current, booking: null });
}

function pushHistory(tenantId, from, role, content) {
  const k = key(tenantId, from);
  const history = historyMap.get(k) || [];
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.shift();
  historyMap.set(k, history);
}

function getHistory(tenantId, from) {
  return historyMap.get(key(tenantId, from)) || [];
}

function dedupeSeen(id) {
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.add(id);
  if (processedMessageIds.size > MAX_DEDUPE_SIZE) processedMessageIds.clear();
  return false;
}

module.exports = {
  clearBooking,
  dedupeSeen,
  getHistory,
  getState,
  pushHistory,
  setState,
};
