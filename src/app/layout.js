import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata = {
  title: "MoneyMap | Encuentra tus fugas",
  description: "Detecta pagos recurrentes y centraliza tus gastos sin fricción.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${outfit.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
