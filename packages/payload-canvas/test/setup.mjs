// Loaded before every test file (`pnpm test`). Outside production, `getPayload` opens a live-reload
// connection to a Next dev server on port 3000. When one runs, that connection keeps the test
// process alive, so tests that start Payload would never exit.
process.env.DISABLE_PAYLOAD_HMR = 'true'
