// Start the dev server against the bundled fixture, so the UI can be reviewed
// without a Qloo key. Never used by the hosted demo.
process.env.QLOO_MOCK = '1';
await import('../src/server.mjs');
