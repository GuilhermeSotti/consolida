import { BrowserCacheLocation, EventType, PublicClientApplication, type AuthenticationResult, type EventMessage } from '@azure/msal-browser';
import { appConfig } from './config';

/**
 * MSAL (Authorization Code + PKCE). Created lazily in the browser only; tokens live in
 * sessionStorage (cleared when the tab closes) — never in localStorage — and the SPA never
 * handles passwords or client secrets.
 */
let instance: PublicClientApplication | null = null;
let ready: Promise<PublicClientApplication> | null = null;

export const loginRequest = { scopes: [appConfig.apiScope] };

export function getMsal(): PublicClientApplication {
  if (!instance) {
    instance = new PublicClientApplication({
      auth: {
        clientId: appConfig.clientId,
        authority: `https://login.microsoftonline.com/${appConfig.tenantId}`,
        redirectUri: `${window.location.origin}/`,
        postLogoutRedirectUri: `${window.location.origin}/`,
      },
      cache: { cacheLocation: BrowserCacheLocation.SessionStorage },
    });
  }
  return instance;
}

/** Initializes MSAL once and keeps the active account in sync after redirects. */
export function initializeMsal(): Promise<PublicClientApplication> {
  if (!ready) {
    const msal = getMsal();
    ready = msal.initialize().then(() => {
      const [first] = msal.getAllAccounts();
      if (!msal.getActiveAccount() && first) msal.setActiveAccount(first);
      msal.addEventCallback((event: EventMessage) => {
        if ((event.eventType === EventType.LOGIN_SUCCESS || event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) && event.payload) {
          const result = event.payload as AuthenticationResult;
          if (result.account) msal.setActiveAccount(result.account);
        }
      });
      return msal;
    });
  }
  return ready;
}
