// Copy to environment.local.ts (gitignored) and run `npm run start:local`.
import { AppEnvironment } from './app-environment';

export const environment: AppEnvironment = {
  production: false,
  coreApiBaseUrl: 'https://api.core.ac.uk/v3',
  coreApiKey: 'paste-your-core-api-key-here',
};
