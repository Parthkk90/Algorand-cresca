/**
 * Cresca — Design System
 * Default theme follows Stitch "Cresca Obsidian" dark tokens.
 */

export const Colors = {
  // Shared aliases used across screens.
  navy: '#AAC9ED',
  steel: '#C3C7CE',
  sky: '#8D9198',
  cream: '#000000',
  white: '#171F33',

  primary: '#AAC9ED',
  primaryContainer: '#2E4D6B',
  tertiary: '#7BD0FF',

  // Semantic
  text: {
    primary: '#DAE2FD',
    secondary: '#C3C7CE',
    muted: '#8D9198',
    inverse: '#10324F',
  },
  bg: {
    screen: '#000000',
    card: '#171F33',
    input: '#131B2E',
    subtle: '#222A3D',
  },
  gain: '#53C7FF',
  loss: '#FFB4AB',
  gainBg: '#00516F',
  lossBg: '#93000A',

  // Borders
  border: '#43474D',
  divider: '#2D3449',

  // Obsidian onboarding palette
  obsidian: {
    background: '#000000',
    surface: '#131B2E',
    surfaceLow: '#171F33',
    surfaceHigh: '#222A3D',
    primary: '#AAC9ED',
    primaryContainer: '#2E4D6B',
    tertiary: '#7BD0FF',
    tertiaryContainer: '#00516F',
    onTertiaryContainer: '#53C7FF',
    text: '#DAE2FD',
    textMuted: '#C3C7CE',
    outline: '#43474D',
    warning: '#FFB4AB',
    warningContainer: '#93000A',
  },
};

export const Typography = {
  // Sizes
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  xxl:  32,
  hero: 44,

  // Weights
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
  xxxl:40,
};

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 999,
};

export const Shadow = {
  card: {
    shadowColor: '#AAC9ED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  subtle: {
    shadowColor: '#AAC9ED',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
};

export const Anim = {
  // Durations
  micro:   150,   // press feedback
  fast:    220,   // quick state change
  normal:  300,   // entrance / exit
  slow:    450,   // hero entrance

  // Spring config for press-release (Reanimated withSpring)
  spring: {
    damping:   18,
    stiffness: 200,
    mass:      0.8,
  } as const,

  // Spring config for sheet/modal entrance
  springModal: {
    damping:   22,
    stiffness: 160,
    mass:      1,
  } as const,
};

// Reusable style object — spread onto Text for money/price values
export const tabularNums = {
  fontVariant: ['tabular-nums'] as const,
} as const;
