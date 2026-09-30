// Only one request may be in flight. Hidden tabs do no background database work,
// and failures back off instead of repeatedly hitting an unavailable provider.
export function startVisiblePolling(
  task: () => Promise<unknown>,
  options: { interval: () => number; stopped?: () => boolean; immediate?: boolean },
) {
  let disposed = false;
  let running = false;
  let failures = 0;
  let retryAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = () => disposed || Boolean(options.stopped?.());
  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!stopped() && !document.hidden) timer = setTimeout(() => void tick(), delay);
  };
  const tick = async () => {
    if (stopped() || document.hidden || running) return;
    if (Date.now() < retryAt) {
      schedule(retryAt - Date.now());
      return;
    }
    running = true;
    try {
      await task();
      failures = 0;
      retryAt = 0;
    } catch {
      failures = Math.min(failures + 1, 5);
      retryAt = Date.now() + Math.min(60_000, 5000 * 2 ** (failures - 1));
    } finally {
      running = false;
      schedule(Math.max(options.interval(), retryAt - Date.now()));
    }
  };
  const wake = () => {
    clearTimeout(timer);
    void tick();
  };
  document.addEventListener("visibilitychange", wake);
  if (options.immediate === false) schedule(options.interval());
  else void tick();
  return {
    wake,
    stop() {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    },
  };
}
