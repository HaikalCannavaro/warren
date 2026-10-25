import type { SVGProps } from 'react';

/** User-supplied Burrow mark, shared by navigation and the meeting-place header. */
export function BurrowIcon({ size = 19, strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M2 6h5a5 5 0 0 1 10 0h5"/>
    <path d="M12 6v6"/>
    <path d="M6 18l6-6 6 6"/>
    <circle cx="6" cy="18" r="2"/>
    <circle cx="18" cy="18" r="2"/>
    <circle cx="12" cy="12" r="1.5"/>
  </svg>;
}
