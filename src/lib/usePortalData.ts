import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { App, MasterFolder, Person } from './types';

/** Loads the shared lists every page needs: people, apps and master folders. */
export function usePortalData() {
  const [people, setPeople] = useState<Person[]>([]);
  const [appList, setAppList] = useState<App[]>([]);
  const [masterFolders, setMasterFolders] = useState<MasterFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, a, f] = await Promise.all([api.listPeople(), api.listApps(), api.listMasterFolders()]);
      setPeople(p);
      setAppList(a);
      setMasterFolders(f);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const apps = useMemo(() => new Map(appList.map((a) => [a.id, a])), [appList]);

  return { people, appList, apps, masterFolders, loading, error, reload };
}
