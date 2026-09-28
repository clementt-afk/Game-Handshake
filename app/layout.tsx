import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "De la cellule au feu — jeu multijoueur",
  description: "Évolue de la cellule à l'humain dans une course multijoueur à 2–8, directement dans ton navigateur.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
