/**
 * Button hierarchy for the dark glass surfaces. Each role has its own color so a CTA never
 * shares the tone of the background:
 * - save: the one primary action (orange).
 * - next: moving forward (solid indigo).
 * - indigo / teal: soft tinted actions, brighter on hover.
 * - ghost: neutral, for "back" and low-priority actions.
 */
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a9b2ff] disabled:cursor-not-allowed disabled:opacity-50";

export const ctaClasses = {
  save: `${base} bg-[var(--brand-orange)] font-semibold text-[#0c0f28] transition-[filter] hover:brightness-115`,
  next: `${base} bg-[#a9b2ff] font-semibold text-[#0c0f28] hover:bg-[#d0d5ff]`,
  indigo: `${base} border border-[#a9b2ff]/40 bg-[#a9b2ff]/15 font-medium text-[#e4e7ff] hover:border-[#a9b2ff]/80 hover:bg-[#a9b2ff]/35 hover:text-white`,
  teal: `${base} border border-[#7fe3d6]/40 bg-[#7fe3d6]/15 font-medium text-[#c8f6f0] hover:border-[#7fe3d6]/80 hover:bg-[#7fe3d6]/30 hover:text-white`,
  ghost: `${base} border border-white/25 font-medium text-[#f2f3ff] hover:bg-white/15`,
} as const;
