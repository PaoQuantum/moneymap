import "./globals.css";

export const metadata = {
  title: "MoneyMap · Entiende tu plata",
  description: "Sube tus extractos (o tráelos de Gmail) y descubre en qué se va tu plata y qué cobros puedes reclamar. Todo se procesa en tu navegador.",
};

export const viewport = { themeColor: "#0ebc7f" };

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
