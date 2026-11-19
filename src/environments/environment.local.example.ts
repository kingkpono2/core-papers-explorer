// Copy to environment.local.ts (gitignored) and run `npm run start:local`.
import { AppEnvironment } from './app-environment';

export const environment: AppEnvironment = {
  production: false,
  coreApiBaseUrl: '/core-api/v3',
  coreApiKey: 'paste-your-core-api-key-here',
};
