import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "dark",
  useSystemColorMode: false,
};

/** Colour schemes light enough that their buttons read best with dark text. */
const LIGHT = new Set(["yellow", "orange", "cyan", "teal", "green", "sky"]);

const theme = extendTheme({
  config,
  styles: {
    global: {
      "html, body": { bg: "#0b1020", color: "white" },
      "::selection": { background: "rgba(250, 204, 21, .35)" },
    },
  },
  colors: {
    // cool ink greys: #0b1020 is the page, #151a2b the surfaces such as dialogs, drawers and the 3D frame
    gray: {
      50: "#f4f6fb", 100: "#e4e8f1", 200: "#cfd5e3", 300: "#b4bccf", 400: "#98a2b8",
      500: "#6f7a94", 600: "#3a4259", 700: "#242b40", 800: "#151a2b", 900: "#0b1020",
    },
    brand: {
      50: "#e3f2ff", 100: "#b3d4ff", 200: "#81b5ff", 300: "#4f96ff", 400: "#1d78ff",
      500: "#045fe6", 600: "#0049b4", 700: "#003282", 800: "#001b51", 900: "#000421",
    },
  },
  radii: { md: "10px", lg: "14px", xl: "18px", "2xl": "22px", "3xl": "28px" },
  shadows: {
    card: "0 1px 0 rgba(255,255,255,.06) inset, 0 10px 30px -12px rgba(0,0,0,.6)",
    lift: "0 1px 0 rgba(255,255,255,.1) inset, 0 18px 40px -14px rgba(0,0,0,.7)",
  },
  fonts: {
    heading: `var(--font-inter), 'Inter', system-ui, sans-serif`,
    body: `var(--font-inter), 'Inter', system-ui, sans-serif`,
  },
  components: {
    Button: {
      baseStyle: { borderRadius: "xl", fontWeight: 700, transition: "transform .12s ease, background-color .15s ease, box-shadow .15s ease", _focusVisible: { boxShadow: "0 0 0 3px rgba(255,255,255,.85)" }, _active: { transform: "scale(.98)" } },
      variants: {
        solid: ({ colorScheme: c }: { colorScheme: string }) => {
          const light = LIGHT.has(c);
          return {
            bg: light ? `${c}.400` : `${c}.500`, color: light ? "gray.900" : "white",
            boxShadow: "0 1px 0 rgba(255,255,255,.28) inset, 0 8px 18px -8px rgba(0,0,0,.65)",
            _hover: { bg: light ? `${c}.300` : `${c}.400`, _disabled: { bg: light ? `${c}.400` : `${c}.500` } },
            _active: { bg: light ? `${c}.500` : `${c}.600` },
          };
        },
        outline: { borderColor: "whiteAlpha.300", color: "white", bg: "whiteAlpha.50", _hover: { bg: "whiteAlpha.200", borderColor: "whiteAlpha.500" }, _active: { bg: "whiteAlpha.300" } },
        ghost: { _hover: { bg: "whiteAlpha.200" }, _active: { bg: "whiteAlpha.300" } },
      },
    },
    Input: {
      variants: {
        outline: { field: { bg: "whiteAlpha.100", borderColor: "whiteAlpha.200", borderRadius: "lg", _placeholder: { color: "gray.500" }, _hover: { borderColor: "whiteAlpha.400" }, _focusVisible: { borderColor: "yellow.300", boxShadow: "0 0 0 1px #fde047" } } },
      },
    },
    Select: {
      variants: {
        outline: { field: { bg: "whiteAlpha.100", borderColor: "whiteAlpha.200", borderRadius: "lg", _hover: { borderColor: "whiteAlpha.400" }, _focusVisible: { borderColor: "yellow.300", boxShadow: "0 0 0 1px #fde047" } } },
      },
    },
    Badge: { baseStyle: { borderRadius: "full", px: 2.5, py: "2px", textTransform: "none", fontWeight: 700, letterSpacing: ".01em" } },
    Modal: { baseStyle: { dialog: { bg: "gray.800", borderRadius: "2xl", border: "1px solid", borderColor: "whiteAlpha.200", boxShadow: "lift" }, overlay: { bg: "blackAlpha.700", backdropFilter: "blur(4px)" } } },
    Drawer: { baseStyle: { dialog: { bg: "gray.800", borderLeft: "1px solid", borderColor: "whiteAlpha.200" }, overlay: { bg: "blackAlpha.700", backdropFilter: "blur(4px)" } } },
    Progress: { baseStyle: { track: { borderRadius: "full" }, filledTrack: { borderRadius: "full" } } },
  },
});

export default theme;
