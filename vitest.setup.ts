import '@testing-library/jest-dom/vitest';

process.env.FLOW_STATE_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
