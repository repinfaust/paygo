export type ThemeName = "shell" | "ember" | "solas" | "pulse";

export interface DesignTheme {
  name: ThemeName;
  marketLabel: string;
  colors: {
    surface: string;
    surfaceLow: string;
    surfaceHigh: string;
    surfaceLowest: string;
    onSurface: string;
    onSurfaceMuted: string;
    primary: string;
    primaryContainer: string;
    secondaryContainer: string;
    onSecondaryContainer: string;
    error: string;
    errorContainer: string;
    glass: string;
    shadow: string;
  };
  type: {
    display: string;
    headline: string;
    title: string;
    body: string;
    label: string;
  };
}

const SHELL: DesignTheme = {
  name: "shell",
  marketLabel: "PAYGO Shell",
  colors: {
    surface: "#f4f6f8",
    surfaceLow: "#e9edf1",
    surfaceHigh: "#dde3e9",
    surfaceLowest: "#ffffff",
    onSurface: "#1b2430",
    onSurfaceMuted: "#576376",
    primary: "#355e8f",
    primaryContainer: "#4a79b0",
    secondaryContainer: "#d5deea",
    onSecondaryContainer: "#1f2f42",
    error: "#ba1a1a",
    errorContainer: "#ffdad6",
    glass: "rgba(255,255,255,0.8)",
    shadow: "rgba(27,36,48,0.08)",
  },
  type: {
    display: "Georgia",
    headline: "Georgia",
    title: "Avenir Next",
    body: "Avenir Next",
    label: "Avenir Next",
  },
};

const EMBER: DesignTheme = {
  name: "ember",
  marketLabel: "Ember (UK)",
  colors: {
    surface: "#fff8f3",
    surfaceLow: "#fcf2e8",
    surfaceHigh: "#f0e7dd",
    surfaceLowest: "#ffffff",
    onSurface: "#251a12",
    onSurfaceMuted: "#6f5846",
    primary: "#855000",
    primaryContainer: "#a76500",
    secondaryContainer: "#eddcc8",
    onSecondaryContainer: "#4e2f0c",
    error: "#ba1a1a",
    errorContainer: "#ffdad6",
    glass: "rgba(255,248,243,0.8)",
    shadow: "rgba(37,26,18,0.07)",
  },
  type: {
    display: "Georgia",
    headline: "Georgia",
    title: "Avenir Next",
    body: "Avenir Next",
    label: "Avenir Next",
  },
};

const SOLAS: DesignTheme = {
  name: "solas",
  marketLabel: "Solas (IE)",
  colors: {
    surface: "#f4fbf7",
    surfaceLow: "#e5f4ec",
    surfaceHigh: "#d3eadf",
    surfaceLowest: "#ffffff",
    onSurface: "#123126",
    onSurfaceMuted: "#44685b",
    primary: "#1d9e75",
    primaryContainer: "#37b78e",
    secondaryContainer: "#d1ece1",
    onSecondaryContainer: "#154737",
    error: "#ba1a1a",
    errorContainer: "#ffdad6",
    glass: "rgba(244,251,247,0.8)",
    shadow: "rgba(18,49,38,0.07)",
  },
  type: {
    display: "Avenir Next",
    headline: "Avenir Next",
    title: "Avenir Next",
    body: "Avenir Next",
    label: "Avenir Next",
  },
};

const PULSE: DesignTheme = {
  name: "pulse",
  marketLabel: "Pulse (US)",
  colors: {
    surface: "#f5f6ff",
    surfaceLow: "#e8e9fb",
    surfaceHigh: "#d9dcf7",
    surfaceLowest: "#ffffff",
    onSurface: "#161628",
    onSurfaceMuted: "#4b4e77",
    primary: "#534ab7",
    primaryContainer: "#6a5ee0",
    secondaryContainer: "#d9d7f7",
    onSecondaryContainer: "#29206b",
    error: "#ba1a1a",
    errorContainer: "#ffdad6",
    glass: "rgba(245,246,255,0.8)",
    shadow: "rgba(22,22,40,0.08)",
  },
  type: {
    display: "Arial Black",
    headline: "Helvetica Neue",
    title: "Helvetica Neue",
    body: "Helvetica Neue",
    label: "Helvetica Neue",
  },
};

export function regionTheme(regionId?: string | null): DesignTheme {
  if (regionId === "UK") return EMBER;
  if (regionId === "IE") return SOLAS;
  if (regionId === "US") return PULSE;
  return SHELL;
}
