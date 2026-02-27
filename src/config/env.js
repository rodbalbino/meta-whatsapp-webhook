function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

module.exports = {
  port: process.env.PORT || 3000,
  verifyToken: process.env.VERIFY_TOKEN,
  graphVersion: process.env.GRAPH_VERSION || 'v22.0',
  openaiApiKey: process.env.OPENAI_API_KEY,
  webhookDebugLogs: envBool('WEBHOOK_DEBUG_LOGS', false),
};
