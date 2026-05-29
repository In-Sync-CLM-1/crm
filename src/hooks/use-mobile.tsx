import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Responsive design hook for mobile detection
 * 
 * Detects whether the current viewport is mobile-sized (< 768px).
 * Uses matchMedia API for efficient runtime detection with event listeners.
 * 
 * @returns True if viewport width is less than 768px
 * 
 * @example
 * ```tsx
 * const isMobile = useIsMobile();
 * 
 * return (
 *   <div>
 *     {isMobile ? <MobileNav /> : <DesktopNav />}
 *   </div>
 * );
 * ```
 * 
 * @remarks
 * - Returns false initially until first measurement
 * - Automatically updates on viewport resize
 * - Cleans up event listeners on unmount
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
