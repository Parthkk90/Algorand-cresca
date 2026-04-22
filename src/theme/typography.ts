export const T = {
  display: {
    fontFamily: "DMSans_700Bold",
    fontSize: 40,
    letterSpacing: -1,
    lineHeight: 46,
  },
  h1: {
    fontFamily: "DMSans_700Bold",
    fontSize: 24,
    lineHeight: 32,
  },
  h2: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    lineHeight: 24,
  },
  h3: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  bodyMd: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  sm: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  smBold: {
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
    lineHeight: 16,
  },
  btn: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    lineHeight: 20,
  },
  address: {
    fontFamily: "DMMono_400Regular",
    fontSize: 12,
    lineHeight: 16,
  },
  hash: {
    fontFamily: "DMMono_400Regular",
    fontSize: 11,
    lineHeight: 14,
  },
} as const;

export type CrescaTypography = typeof T;
