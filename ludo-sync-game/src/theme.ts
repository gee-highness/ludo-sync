// src/theme.ts
import { extendTheme, type ThemeConfig } from "@chakra-ui/react"; // ✅ CORRECT

// Optional: Add your color mode config (light/dark)
const config: ThemeConfig = {
    initialColorMode: "light",
    useSystemColorMode: false,
};

// Extend the default theme with your custom config
const theme = extendTheme({
    config,
    colors: {
        brand: {
            50: "#e3f2ff",
            100: "#b3d4ff",
            200: "#81b5ff",
            300: "#4f96ff",
            400: "#1d78ff",
            500: "#045fe6", // base brand color
            600: "#0049b4",
            700: "#003282",
            800: "#001b51",
            900: "#000421",
        },
    },
    fonts: {
        heading: `'Inter', sans-serif`,
        body: `'Inter', sans-serif`,
    },
});

export default theme;
