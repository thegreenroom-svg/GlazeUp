'use client';

import { useEffect, useRef, useState } from 'react';

export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isAtTop = useRef(true);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      isAtTop.current = window.scrollY === 0;
      if (isAtTop.current) {
        startY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isAtTop.current) return;
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;
      if (distance > 0 && window.scrollY === 0) {
        setPullDistance(Math.min(distance, 100));
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > 60) {
        setPulling(true);
        await onRefresh();
        setPulling(false);
      }
      setPullDistance(0);
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, onRefresh]);

  return { pulling, pullDistance };
}
