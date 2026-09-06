import { useAnimate } from "motion/react-mini";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { motionIsReduced, subscribeMotion } from "./motion-preference.ts";

export function useMotionReduced() {
  return useSyncExternalStore(subscribeMotion, motionIsReduced, () => true);
}

// Animate explicit navigation, never polling. The wrapper stays mounted so forms
// retain their state and focus; actions never wait for an animation to finish.
export function MotionSurface({
  change,
  className,
  children
}: {
  change: string | number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useMotionReduced();
  const previous = useRef(change);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  useEffect(() => {
    const changed = previous.current !== change;
    previous.current = change;
    if (reduced || !changed) return;
    const animation = animate(
      scope.current,
      { opacity: [0.85, 1], transform: ["translateY(4px)", "none"] },
      { duration: 0.18, ease: "easeOut" }
    );
    return () => animation.cancel();
  }, [change, reduced, animate, scope]);
  return (
    <div ref={scope} className={className} data-motion-surface>
      {children}
    </div>
  );
}
