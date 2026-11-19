import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

export function createProfileAuth(clientId) {
  const home = new URL('./', import.meta.url).href;
  const store = new WebStorageStateStore({ store: localStorage });
  const manager = new UserManager({
    authority: 'https://auth.spacetimedb.com/oidc',
    client_id: clientId,
    redirect_uri: home,
    response_type: 'code',
    scope: 'openid email offline_access',
    stateStore: store,
    userStore: store,
    automaticSilentRenew: false,
    loadUserInfo: false,
  });
  let nextRenewal = 0;
  let message = '';
  const withSessionLock = run => navigator.locks
    ? navigator.locks.request('fruit-wars-auth-' + clientId, run)
    : run();
  const url = new URL(location.href);
  const callback = url.searchParams.has('state') && (url.searchParams.has('code') || url.searchParams.has('error'));
  if (callback) message = 'Completing email sign-in…';
  const initialized = callback ? manager.signinRedirectCallback(url.href).then(() => {
    message = 'Connecting your profile…';
  }).catch(() => {
    message = 'This email sign-in could not be completed. Request a new link in this browser.';
  }).finally(() => {
    history.replaceState(history.state, '', home);
  }) : Promise.resolve();

  async function renew() {
    const user = await manager.getUser();
    if (!user?.refresh_token || user.expires_in > 60 || Date.now() < nextRenewal) return user;
    nextRenewal = Date.now() + 15000;
    try {
      return await manager.signinSilent() ?? user;
    } catch {
      return await manager.getUser();
    }
  }

  return {
    async user() {
      await initialized;
      const user = await withSessionLock(renew);
      return user && !user.expired ? user : null;
    },
    signIn() {
      return manager.signinRedirect({ prompt: 'login' });
    },
    async signOut() {
      await initialized;
      await withSessionLock(() => manager.removeUser());
      message = '';
    },
    message: () => message,
    profileConnected() {
      message = '';
    },
  };
}
