import type { SVGProps } from 'react';
export function ObserverIcon({ size = 19, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M2 12s3.8-6.5 10-6.5 10 6.5 10 6.5-3.8 6.5-10 6.5-10-6.5-10-6.5Z"/>
    <circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>
    <path d="M12 2v2.5"/><path d="M12 19.5v2.5"/>
  </svg>;
}
