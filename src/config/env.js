module.exports = {
  port: process.env.PORT || 3000,
  verifyToken: process.env.VERIFY_TOKEN,
  graphVersion: process.env.GRAPH_VERSION || 'v22.0',
  openaiApiKey: process.env.OPENAI_API_KEY,
};
