// src/app/theme/theme.ts
import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import { mode } from '@chakra-ui/theme-tools';

// 1. Define the color palette for Synapse Digital
const colors = {
  brand: {
    // Vibrant Orange from your image (#FF4F00)
    50: '#FFF2EC',
    100: '#FFD6C2',
    200: '#FFB999',
    300: '#FF9C70',
    400: '#FF7F47',
    500: '#FF4F00', // Primary brand color - vibrant orange
    600: '#E04600',
    700: '#C23D00',
    800: '#A33400',
    900: '#852B00',
  },
  neutral: {
    light: { // These are for light mode, which we are not primarily using but good to have
      'bg-primary': '#F9FAFB',
      'bg-secondary': '#FFFFFF',
      'bg-header': '#FFFFFF',
      'bg-card': '#FFFFFF',
      'text-primary': '#222222',
      'text-secondary': '#4A5568',
      'border-color': '#E2E8F0',
      'input-bg': '#FFFFFF',
      'input-border': '#CBD5E0',
      'placeholder-color': '#A0AEC0',
      'tag-bg': '#EDF2F7',
      'tag-color': '#4A5568',
      'status-green': '#38A169',
      'status-orange': '#ED8936',
      'status-red': '#E53E3E',
      'status-purple': '#805AD5',
    },
    dark: {
      'bg-primary': '#0A0A0F', // Deep dark background (from old Tailwind config)
      'bg-secondary': '#121212', // Very dark charcoal for sections and secondary elements
      'bg-header': '#151515',   // Dark header
      'bg-card': '#151515',     // Dark card background for depth
      'text-primary': '#E0E0E0', // Light grey for main text (from old Tailwind config)
      'text-secondary': '#888888', // Darker grey for secondary text (from old Tailwind config)
      'border-color': '#2A2A3A', // Subtle border color (from old Tailwind config)
      'input-bg': '#151515',
      'input-border': '#444444',
      'placeholder-color': '#888888',
      'tag-bg': '#151515',
      'tag-color': '#F7FAFC',
      'status-green': '#48BB78',
      'status-orange': '#F6AD55',
      'status-red': '#FC8181',
      'status-purple': '#B794F4',
    },
  },
  // Add the secondary-glow color directly to the top level for easy access
  'secondary-glow': '#FF00FF', // Magenta for secondary highlights
};

// 2. Configure initial color mode
const config: ThemeConfig = {
  initialColorMode: 'dark', // Set initial theme to dark mode
  useSystemColorMode: false, // Don't use the system's color mode preference
};

// 3. Define global styles
const styles = {
  global: (props: Record<string, any>) => ({
    body: {
      bg: mode(colors.neutral.light['bg-primary'], colors.neutral.dark['bg-primary'])(props),
      color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    },
    'html, #__next': {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    },
    // Styles for the page transition overlay
    '.page-transition-overlay': {
      backgroundColor: mode(colors.neutral.light['bg-primary'], colors.neutral.dark['bg-primary'])(props),
    },
    // Wipe rows for transition (using brand color)
    '.wipe-row': {
      backgroundColor: mode(colors.brand[500], colors.brand[500])(props),
    },
    '.loading-spinner-container': {
      backgroundColor: mode(colors.neutral.light['bg-primary'], colors.neutral.dark['bg-primary'])(props),
      boxShadow: mode('lg', 'dark-lg')(props),
      borderRadius: 'md',
      padding: '4',
    },
    // General link styling for non-Chakra Link components (e.g., NextLink)
    a: {
      color: mode(colors.brand[500], colors.brand[300])(props),
      _hover: {
        textDecoration: 'underline',
      },
    },
    // Custom scrollbar styles
    '::-webkit-scrollbar': {
      width: '8px',
    },
    '::-webkit-scrollbar-track': {
      background: colors.neutral.dark['bg-primary'], // Use background-dark
    },
    '::-webkit-scrollbar-thumb': {
      background: colors.brand[500], // Use primary orange
      borderRadius: '4px',
    },
    '::-webkit-scrollbar-thumb:hover': {
      background: colors['secondary-glow'], // Use secondary glow
    },
  }),
};

// 4. Component overrides for a beautiful, professional look
const components = {
  Button: {
    baseStyle: (props: Record<string, any>) => ({
      fontWeight: 'semibold',
      borderRadius: 'lg',
      _focus: {
        boxShadow: 'outline',
      },
      _active: {
        transform: 'scale(0.98)',
      },
      transition: 'all 0.2s ease-in-out',
    }),
    variants: {
      solid: (props: Record<string, any>) => ({
        bg: props.colorScheme === 'brand' ? mode(colors.brand[500], colors.brand[500])(props) : undefined,
        color: props.colorScheme === 'brand' ? 'white' : undefined,
        _hover: {
          bg: props.colorScheme === 'brand' ? mode(colors.brand[600], colors.brand[600])(props) : undefined,
          boxShadow: 'md',
          _disabled: {
            bg: mode('gray.200', 'whiteAlpha.300')(props),
          },
        },
        _active: {
          bg: props.colorScheme === 'brand' ? mode(colors.brand[700], colors.brand[700])(props) : undefined,
        },
      }),
      outline: (props: Record<string, any>) => ({
        borderColor: props.colorScheme === 'brand' ? mode(colors.brand[500], colors.brand[400])(props) : mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
        color: props.colorScheme === 'brand' ? mode(colors.brand[500], colors.brand[400])(props) : mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        _hover: {
          bg: props.colorScheme === 'brand' ? mode(colors.brand[50], colors.brand[900])(props) : mode(colors.neutral.light['bg-secondary'], colors.neutral.dark['bg-secondary'])(props),
          borderColor: props.colorScheme === 'brand' ? mode(colors.brand[600], colors.brand[500])(props) : undefined,
          boxShadow: 'sm',
        },
      }),
      ghost: (props: Record<string, any>) => ({
        color: mode(colors.neutral.light['text-secondary'], colors.neutral.dark['text-secondary'])(props),
        _hover: {
          bg: mode(colors.neutral.light['tag-bg'], colors.neutral.dark['tag-bg'])(props),
          color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        },
      }),
    },
  },
  Card: {
    baseStyle: (props: Record<string, any>) => ({
      container: {
        bg: mode(colors.neutral.light['bg-card'], colors.neutral.dark['bg-card'])(props),
        borderRadius: 'xl',
        boxShadow: mode('md', 'dark-md')(props),
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
        borderWidth: '1px',
        transition: 'all 0.2s ease-in-out',
      },
    }),
  },
  Link: {
    baseStyle: (props: Record<string, any>) => ({
      color: mode(colors.brand[500], colors.brand[300])(props),
      _hover: {
        textDecoration: 'underline',
        color: mode(colors.brand[600], colors.brand[400])(props),
      },
    }),
  },
  Input: {
    variants: {
      outline: (props: Record<string, any>) => ({
        field: {
          bg: mode(colors.neutral.light['input-bg'], colors.neutral.dark['input-bg'])(props),
          borderColor: mode(colors.neutral.light['input-border'], colors.neutral.dark['input-border'])(props),
          _hover: {
            borderColor: mode(colors.brand[300], colors.brand[400])(props),
          },
          _focusVisible: {
            borderColor: mode(colors.brand[500], colors.brand[300])(props),
            boxShadow: `0 0 0 1px ${mode(colors.brand[500], colors.brand[300])(props)}`,
          },
          _placeholder: {
            color: mode(colors.neutral.light['placeholder-color'], colors.neutral.dark['placeholder-color'])(props),
          },
        },
      }),
    },
  },
  Textarea: {
    variants: {
      outline: (props: Record<string, any>) => ({
        bg: mode(colors.neutral.light['input-bg'], colors.neutral.dark['input-bg'])(props),
        borderColor: mode(colors.neutral.light['input-border'], colors.neutral.dark['input-border'])(props),
        _hover: {
          borderColor: mode(colors.brand[300], colors.brand[400])(props),
        },
        _focusVisible: {
          borderColor: mode(colors.brand[500], colors.brand[300])(props),
          boxShadow: `0 0 0 1px ${mode(colors.brand[500], colors.brand[300])(props)}`,
        },
        _placeholder: {
          color: mode(colors.neutral.light['placeholder-color'], colors.neutral.dark['placeholder-color'])(props),
        },
      }),
    },
  },
  Select: {
    variants: {
      outline: (props: Record<string, any>) => ({
        field: {
          bg: mode(colors.neutral.light['input-bg'], colors.neutral.dark['input-bg'])(props),
          borderColor: mode(colors.neutral.light['input-border'], colors.neutral.dark['input-border'])(props),
          _hover: {
            borderColor: mode(colors.brand[300], colors.brand[400])(props),
          },
          _focusVisible: {
            borderColor: mode(colors.brand[500], colors.brand[300])(props),
            boxShadow: `0 0 0 1px ${mode(colors.brand[500], colors.brand[300])(props)}`,
          },
          _placeholder: {
            color: mode(colors.neutral.light['placeholder-color'], colors.neutral.dark['placeholder-color'])(props),
          },
        },
      }),
    },
  },
  Tag: {
    baseStyle: (props: Record<string, any>) => ({
      container: {
        bg: mode(colors.neutral.light['tag-bg'], colors.neutral.dark['tag-bg'])(props),
        color: mode(colors.neutral.light['tag-color'], colors.neutral.dark['tag-color'])(props),
        borderRadius: 'md',
      },
    }),
    variants: {
        subtle: (props: Record<string, any>) => {
            let bgColor = '';
            let textColor = '';
            if (props.colorScheme === 'green') {
                bgColor = mode(colors.neutral.light['status-green'], colors.neutral.dark['status-green'])(props);
                textColor = mode('white', 'white')(props);
            } else if (props.colorScheme === 'orange') {
                bgColor = mode(colors.neutral.light['status-orange'], colors.neutral.dark['status-orange'])(props);
                textColor = mode('white', 'white')(props);
            } else if (props.colorScheme === 'red') {
                bgColor = mode(colors.neutral.light['status-red'], colors.neutral.dark['status-red'])(props);
                textColor = mode('white', 'white')(props);
            } else if (props.colorScheme === 'purple') {
                bgColor = mode(colors.neutral.light['status-purple'], colors.neutral.dark['status-purple'])(props);
                textColor = mode('white', 'white')(props);
            } else { // Default to gray
                bgColor = mode('gray.100', 'whiteAlpha.300')(props);
                textColor = mode('gray.800', 'whiteAlpha.800')(props);
            }
            return {
                container: {
                    bg: bgColor,
                    color: textColor,
                },
            };
        },
    },
  },
  Table: {
    baseStyle: (props: Record<string, any>) => ({
      th: {
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
        fontWeight: 'bold',
        textTransform: 'capitalize',
      },
      td: {
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
      },
      container: {
        bg: mode(colors.neutral.light['bg-card'], colors.neutral.dark['bg-card'])(props),
        borderRadius: 'lg',
        boxShadow: mode('md', 'dark-md')(props),
        border: '1px solid',
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
      },
    }),
  },
};

// 5. Extend the theme
const theme = extendTheme({
  config,
  colors,
  styles,
  components,
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
    md: '0 4px 6px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
    lg: '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
    xl: '0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)',
    'dark-sm': '0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12)',
    'dark-md': '0 4px 6px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)',
    'dark-lg': '0 10px 15px rgba(0,0,0,0.4), 0 4px 6px rgba(0,0,0,0.25)',
    'dark-xl': '0 20px 25px rgba(0,0,0,0.5), 0 10px 10px rgba(0,0,0,0.3)',
    outline: '0 0 0 3px rgba(255, 79, 0, 0.6)', // Updated to use primary orange for outline
  },
  fonts: {
    heading: `'Inter', sans-serif`,
    body: `'Inter', sans-serif`,
  },
});

export default theme;
