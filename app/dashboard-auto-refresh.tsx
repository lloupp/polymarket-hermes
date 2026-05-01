'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function DashboardAutoRefresh({ refreshSeconds }: { refreshSeconds: number }) {
  const router = useRouter();

  useEffect(() => {
    if (refreshSeconds <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSeconds, router]);

  return null;
}
