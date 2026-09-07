/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        navy: {
          50: "#f0f3f9",
          100: "#d9e0ef",
          200: "#b3c1df",
          300: "#8da2cf",
          400: "#6783bf",
          500: "#4164af",
          600: "#34508c",
          700: "#273c69",
          800: "#1a2846",
          900: "#0d1423",
          950: "#060a12",
        },
        risk: {
          low: "#22c55e",
          medium: "#f59e0b",
          high: "#ef4444",
          review: "#f59e0b",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      outlineColor: {
        ring: "var(--ring)",
      },
      keyframes: {
        enter: {
          from: {
            opacity: "var(--tw-enter-opacity, 1)",
            transform:
              "translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1)) rotate(var(--tw-enter-rotate, 0))",
            filter: "blur(var(--tw-enter-blur, 0))",
          },
        },
        exit: {
          to: {
            opacity: "var(--tw-exit-opacity, 1)",
            transform:
              "translate3d(var(--tw-exit-translate-x, 0), var(--tw-exit-translate-y, 0), 0) scale3d(var(--tw-exit-scale, 1), var(--tw-exit-scale, 1), var(--tw-exit-scale, 1)) rotate(var(--tw-exit-rotate, 0))",
            filter: "blur(var(--tw-exit-blur, 0))",
          },
        },
      },
      animation: {
        in: "enter 150ms ease both",
        out: "exit 150ms ease both",
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    // Tailwind v3 port of the v4-only variants and utilities that ship inside
    // shadcn/tailwind.css and tw-animate-css (inert under v3 without this).
    require("tailwindcss/plugin")(function ({ addVariant, addUtilities }) {
      addVariant("data-open", [
        '&:where([data-state="open"])',
        '&:where([data-open]:not([data-open="false"]))',
      ]);
      addVariant("data-closed", [
        '&:where([data-state="closed"])',
        '&:where([data-closed]:not([data-closed="false"]))',
      ]);
      addVariant("data-checked", [
        '&:where([data-state="checked"])',
        '&:where([data-checked]:not([data-checked="false"]))',
      ]);
      addVariant("data-unchecked", [
        '&:where([data-state="unchecked"])',
        '&:where([data-unchecked]:not([data-unchecked="false"]))',
      ]);
      addVariant("data-selected", '&:where([data-selected="true"])');
      addVariant("data-disabled", [
        '&:where([data-disabled="true"])',
        '&:where([data-disabled]:not([data-disabled="false"]))',
      ]);
      addVariant("data-active", [
        '&:where([data-state="active"])',
        '&:where([data-active]:not([data-active="false"]))',
      ]);
      addVariant("data-horizontal", '&:where([data-orientation="horizontal"])');
      addVariant("data-vertical", '&:where([data-orientation="vertical"])');
      addVariant(
        "data-starting-style",
        "&:where([data-starting-style], [data-starting-style] *)"
      );
      addVariant(
        "data-ending-style",
        "&:where([data-ending-style], [data-ending-style] *)"
      );
      addVariant(
        "data-popup-open",
        '&:where([data-popup-open]:not([data-popup-open="false"]))'
      );
      addVariant(
        "data-inset",
        '&:where([data-inset]:not([data-inset="false"]))'
      );

      addUtilities({
        ".fade-in-0": { "--tw-enter-opacity": "0" },
        ".fade-out-0": { "--tw-exit-opacity": "0" },
        ".zoom-in-95": { "--tw-enter-scale": "0.95" },
        ".zoom-out-95": { "--tw-exit-scale": "0.95" },
        ".slide-in-from-top-2": { "--tw-enter-translate-y": "-0.5rem" },
        ".slide-in-from-bottom-2": { "--tw-enter-translate-y": "0.5rem" },
        ".slide-in-from-left-2": { "--tw-enter-translate-x": "-0.5rem" },
        ".slide-in-from-right-2": { "--tw-enter-translate-x": "0.5rem" },
      });
    }),
  ],
};
