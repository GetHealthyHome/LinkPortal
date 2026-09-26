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
const PERSON_KEY = 'linkportal.selectedPerson';
const personTokenKey = (personId: string) => `linkportal.personToken.${personId}`;

export const session = {
  getAdminToken: () => read(() => sessionStorage, ADMIN_KEY),
  setAdminToken: (token: string | null) => write(() => sessionStorage, ADMIN_KEY, token),

  getPersonToken: (personId: string) => read(() => sessionStorage, personTokenKey(personId)),
  setPersonToken: (personId: string, token: string | null) =>
    write(() => sessionStorage, personTokenKey(personId), token),

  getSelectedPerson: () => read(() => localStorage, PERSON_KEY),
  setSelectedPerson: (personId: string | null) => write(() => localStorage, PERSON_KEY, personId),
};
