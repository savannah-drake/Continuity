// components/icons.tsx: small line icons (24px grid, 1.75 stroke) used instead of emoji.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const HomeIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" /></svg>;
export const CareIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>;
export const TimelineIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>;
export const PersonIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
export const MicIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const MicOffIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /></svg>;
export const HangUpIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 14.5c5-4.7 13-4.7 18 0l-2 2.3-3.4-1.3v-2.6a9.5 9.5 0 0 0-7.2 0v2.6L5 16.8z" /></svg>;
export const PhoneIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>;
export const ArrowIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 6l6 6-6 6" /></svg>;
export const ExternalIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
export const PlusIcon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>;
