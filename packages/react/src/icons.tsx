import type { SVGProps } from 'react';

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) =>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;

export const PlayIcon = () => <Icon><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></Icon>;
export const PauseIcon = () => <Icon><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/></Icon>;
export const PreviousIcon = () => <Icon><path d="M7 5v14M18 6l-8 6 8 6z" /></Icon>;
export const NextIcon = () => <Icon><path d="M17 5v14M6 6l8 6-8 6z" /></Icon>;
export const ResetIcon = () => <Icon><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" /></Icon>;
export const FullscreenIcon = () => <Icon><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></Icon>;
export const ExitFullscreenIcon = () => <Icon><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" /></Icon>;
export const ExternalIcon = () => <Icon width="13" height="13"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>;
