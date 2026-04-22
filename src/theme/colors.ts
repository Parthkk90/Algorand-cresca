export const C = {
  surfaces: {
    bgBase: "#FFFFFF",
    bgSurface: "#F7F7F7",
    bgSunken: "#EFEFEF",
    bgDark: "#111111",
    bgOverlay: "rgba(0,0,0,0.48)",
    bgSheet: "#FFFFFF",
  },
  brand: {
    teal: "#00D4AA",
    tealDim: "#00B892",
    purple: "#6E56CF",
    purpleDim: "#5A42B8",
    black: "#0D0D0D",
  },
  semantic: {
    danger: "#F04438",
    warning: "#F79009",
    success: "#12B76A",
    info: "#1D4ED8",
  },
  text: {
    t1: "#0D0D0D",
    t2: "#6B7280",
    t3: "#AAAAAA",
    tPh: "#C4C4C4",
    tInv: "#FFFFFF",
  },
  borders: {
    bDefault: "#E5E7EB",
    bStrong: "#D1D5DB",
    bVerified: "#00D4AA",
    bError: "#F04438",
    bFocus: "#6E56CF",
  },
  networks: {
    algorand: "#00D4AA",
    ethereum: "#627EEA",
    bitcoin: "#F7931A",
    bnb: "#F3BA2F",
    polygon: "#8247E5",
  },
} as const;

export type CrescaColors = typeof C;
