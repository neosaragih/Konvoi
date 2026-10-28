export const colors = {
  background: '#09090B', // shadcn zinc-950
  surface: '#18181B', // shadcn zinc-900 (card)
  surfaceAlt: '#27272A', // shadcn zinc-800
  border: '#27272A', // shadcn zinc-800 border
  text: '#F4F4F5', // shadcn zinc-100
  muted: '#A1A1AA', // shadcn zinc-400
  primary: '#38BDF8', // sky-400 (convoy primary)
  primaryPressed: '#0284C7', // sky-600
  onPrimary: '#09090B', // zinc-950
  success: '#22C55E', // emerald-500
  warning: '#F59E0B', // amber-500
  danger: '#EF4444', // red-500
  dangerSurface: '#450A0A', // red-950
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

export const typography = {
  hero: 34,
  title: 24,
  heading: 18,
  body: 15,
  small: 13,
  tiny: 11,
} as const;
