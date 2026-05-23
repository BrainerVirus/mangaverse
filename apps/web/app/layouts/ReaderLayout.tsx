import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore.js';

export function ReaderLayout({ children }: { children: React.ReactNode }) {
  const { toggleReaderChrome, setReaderChrome } = useLayoutStore();

  useEffect(() => {
    setReaderChrome(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleReaderChrome();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleReaderChrome, setReaderChrome]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {children}
    </div>
  );
}