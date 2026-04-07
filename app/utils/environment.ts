export function isElectronRenderer() {
  if (typeof window === 'undefined') {
    return false;
  }

  const win = window as typeof window & {
    ipc?: unknown;
    process?: {
      type?: string;
    };
  };

  return (
    typeof win.ipc !== 'undefined' ||
    win.process?.type === 'renderer' ||
    window.navigator.userAgent.toLowerCase().includes('electron/')
  );
}
