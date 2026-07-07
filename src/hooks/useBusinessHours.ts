import { useEffect, useState } from "react";

// Same boundaries and mechanism as the RMPL project: keep realtime dashboard
// subscriptions open only during business hours, fall back to on-demand
// (fetch-on-view) the rest of the time, with a manual override for whenever
// live data is actually needed outside that window.
const STORAGE_KEY = "crm-quiet-hours-override";
const BUSINESS_START_MIN = 9 * 60 + 30;
const BUSINESS_END_MIN = 20 * 60;

const getISTMinutes = (date: Date): number => {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + 5 * 60 + 30) % (24 * 60);
};

export const isWithinBusinessHoursIST = (date: Date = new Date()): boolean => {
  const m = getISTMinutes(date);
  return m >= BUSINESS_START_MIN && m < BUSINESS_END_MIN;
};

const readOverride = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const useBusinessHours = () => {
  const [, setTick] = useState(0);
  const [override, setOverrideState] = useState<boolean>(readOverride);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setOverrideState(readOverride());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isBusinessHours = isWithinBusinessHoursIST();
  const liveUpdatesActive = isBusinessHours || override;

  const setOverride = (val: boolean) => {
    try {
      if (val) localStorage.setItem(STORAGE_KEY, "true");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setOverrideState(val);
  };

  return {
    isBusinessHours,
    override,
    setOverride,
    liveUpdatesActive,
  };
};
