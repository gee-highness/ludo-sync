import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "dark",
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  styles: {
    global: {
      "html, body": { bg: "#10172E", color: "white" },
    },
  },
  colors: {
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
