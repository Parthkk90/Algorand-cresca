/**
 * Cresca — Design System
 * Default theme follows Stitch "Cresca Obsidian" dark tokens.
 */

export const Colors = {
  // Shared aliases used across screens.
  navy: '#0D0D0D',
  steel: '#6B7280',
  sky: '#AAAAAA',
  cream: '#FFFFFF',
  white: '#FFFFFF',

  primary: '#00D4AA',
  primaryContainer: '#DDF9F2',
  tertiary: '#6E56CF',

  // Semantic
  text: {
    primary: '#0D0D0D',
    secondary: '#6B7280',
    muted: '#AAAAAA',
    inverse: '#FFFFFF',
  },
  bg: {
    screen: '#FFFFFF',
    card: '#F7F7F7',
    input: '#F7F7F7',
    subtle: '#EFEFEF',
    dark: '#111111',
  },
  gain: '#12B76A',
  loss: '#F04438',
  gainBg: '#DDF9F2',
  lossBg: '#FEE4E2',

  // Borders
  border: '#E5E7EB',
  divider: '#E5E7EB',

  // Obsidian onboarding palette
  obsidian: {
    background: '#FFFFFF',
    surface: '#F7F7F7',
    surfaceLow: '#FFFFFF',
    surfaceHigh: '#EFEFEF',
    primary: '#00D4AA',
    primaryContainer: '#DDF9F2',
    tertiary: '#6E56CF',
    tertiaryContainer: 'rgba(110,86,207,0.08)',
    onTertiaryContainer: '#6E56CF',
    text: '#0D0D0D',
    textMuted: '#6B7280',
    outline: '#E5E7EB',
    warning: '#F04438',
    warningContainer: '#FEE4E2',
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
