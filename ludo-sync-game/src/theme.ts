import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "dark",
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  styles: {
    global: {
      "html, body": { bg: "#303030", color: "white" },
    },
  },
  colors: {
    // neutral greys instead of Chakra's blue-tinted ones: #333 page, #151515 for surfaces such as dialogs, drawers and the 3D frame
    gray: {
      50: "#f5f5f5", 100: "#e6e6e6", 200: "#d4d4d4", 300: "#bdbdbd", 400: "#a8a8a8",
      500: "#7a7a7a", 600: "#444444", 700: "#2b2b2b", 800: "#151515", 900: "#0d0d0d",
    },
    brand: {
      50: "#e3f2ff", 100: "#b3d4ff", 200: "#81b5ff", 300: "#4f96ff", 400: "#1d78ff",
      500: "#045fe6", 600: "#0049b4", 700: "#003282", 800: "#001b51", 900: "#000421",
    },
  },
  fonts: {
    heading: `var(--font-inter), 'Inter', system-ui, sans-serif`,
    body: `var(--font-inter), 'Inter', system-ui, sans-serif`,
  },
  components: {
    Button: { baseStyle: { _focusVisible: { boxShadow: "0 0 0 3px rgba(255,255,255,.85)" } } },
  },
});

export default theme;
