const historyMap = new Map();
const stateMap = new Map();
const processedMessageIds = new Set();

const MAX_HISTORY = 12;
const MAX_DEDUPE_SIZE = 5000;

function getState(from) {
  return stateMap.get(from) || { handoff: false, booking: null };
}

function setState(from, patch) {
  const current = getState(from);
  stateMap.set(from, { ...current, ...patch });
}

function clearBooking(from) {
  const current = getState(from);
  stateMap.set(from, { ...current, booking: null });
}

function pushHistory(from, role, content) {
  const history = historyMap.get(from) || [];
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.shift();
  historyMap.set(from, history);
}

function getHistory(from) {
  return historyMap.get(from) || [];
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
