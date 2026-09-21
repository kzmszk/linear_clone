import { createApp } from './app.ts';
import { authenticateAccess } from './auth.ts';

const app = createApp(authenticateAccess);

export { Tracker } from './tracker.ts';
export default app;
