export const ACCOUNT_CONFIG = {
  authServer: {
    baseUrl: 'https://auth.context.sh',
    authTimeoutMs: Number(process.env.CONTEXT_AUTH_TIMEOUT_MS || 300000),
  },
};
