import { useEffect, useState } from 'react';
import { getDisabledVendors, loadDisabledVendors } from '../disabled-vendors.js';

/** Integration vendors the deployment switched off (`GET /auth/config` → `disabledVendors`, e.g. `sqlite` unless `ENABLE_SQLITE_INTEGRATION=true`); `[]` until loaded or if the fetch fails (the backend rejects a disabled vendor anyway). */
export const useDisabledVendors = (): readonly string[] => {
  const [disabledVendors, setDisabledVendors] = useState<readonly string[]>(getDisabledVendors());
  useEffect(() => {
    let cancelled = false;
    loadDisabledVendors().then((vendors) => {
      if (!cancelled) setDisabledVendors(vendors);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return disabledVendors;
};
