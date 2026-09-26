// Small helpers around sessionStorage/localStorage. Storage can be blocked
// (private windows, strict settings), so every access is guarded.

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Ignore: the app still works, it just won't remember.
  }
}

const ADMIN_KEY = 'linkportal.adminToken';
const ADMIN_FROM_PIN_KEY = 'linkportal.adminFromPin';
const PERSON_KEY = 'linkportal.selectedPerson';
const personTokenKey = (personId: string) => `linkportal.personToken.${personId}`;

export const session = {
  getAdminToken: () => read(() => sessionStorage, ADMIN_KEY),
  setAdminToken: (token: string | null) => {
    write(() => sessionStorage, ADMIN_KEY, token);
    if (!token) write(() => sessionStorage, ADMIN_FROM_PIN_KEY, null);
  },
  /** True when the admin session came from an admin's PIN (so it ends with their visit). */
  adminFromPin: () => read(() => sessionStorage, ADMIN_FROM_PIN_KEY) !== null,
  /** The person whose PIN unlocked the current admin session, if any. */
  adminPinPerson: () => read(() => sessionStorage, ADMIN_FROM_PIN_KEY),

  /** Stores what a person's PIN sign-in returned, including an admin session for admins. */
  savePersonSignIn: (personId: string, signIn: { token: string; adminToken: string | null }) => {
    write(() => sessionStorage, personTokenKey(personId), signIn.token);
    if (signIn.adminToken) {
      write(() => sessionStorage, ADMIN_KEY, signIn.adminToken);
      write(() => sessionStorage, ADMIN_FROM_PIN_KEY, personId);
    }
  },

  getPersonToken: (personId: string) => read(() => sessionStorage, personTokenKey(personId)),
  setPersonToken: (personId: string, token: string | null) =>
    write(() => sessionStorage, personTokenKey(personId), token),

  /** Ends every session on this device: admin, and the PIN session of whoever unlocked it. */
  signOutAll: (endSession: (token: string) => Promise<unknown>) => {
    const admin = read(() => sessionStorage, ADMIN_KEY);
    const pinPerson = read(() => sessionStorage, ADMIN_FROM_PIN_KEY);
    if (admin) void endSession(admin).catch(() => {});
    if (pinPerson) {
      const personToken = read(() => sessionStorage, personTokenKey(pinPerson));
      if (personToken) void endSession(personToken).catch(() => {});
      write(() => sessionStorage, personTokenKey(pinPerson), null);
    }
    write(() => sessionStorage, ADMIN_KEY, null);
    write(() => sessionStorage, ADMIN_FROM_PIN_KEY, null);
  },

  getSelectedPerson: () => read(() => localStorage, PERSON_KEY),
  setSelectedPerson: (personId: string | null) => write(() => localStorage, PERSON_KEY, personId),
};
