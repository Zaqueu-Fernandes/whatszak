import { ReactNode, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
}

const PULL_THRESHOLD = 70; // px of drag needed to release into a refresh
const MAX_PULL = 100;
const RESISTANCE = 0.5; // dragging feels heavier than a 1:1 finger-follow

// Hand-rolled so it doesn't pull in a dependency for something this small.
// Only activates when the scrollable content is already at its top edge —
// otherwise a normal downward scroll would trigger it.
export default function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    draggingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingRef.current || startYRef.current == null) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      draggingRef.current = false;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    e.preventDefault();
    setPullDistance(Math.min(MAX_PULL, delta * RESISTANCE));
  };

  const handleTouchEnd = async () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    startYRef.current = null;
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const indicatorHeight = refreshing ? PULL_THRESHOLD : pullDistance;
  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {indicatorHeight > 0 && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none overflow-hidden"
          style={{ height: indicatorHeight, transition: draggingRef.current ? "none" : "height 150ms ease-out" }}
        >
          <RefreshCw
            className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
            style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)`, opacity: progress }}
          />
        </div>
      )}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain"
        style={{
          transform: `translateY(${indicatorHeight}px)`,
          transition: draggingRef.current ? "none" : "transform 150ms ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
