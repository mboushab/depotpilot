import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoxPilot",
  description: "Application de gestion de dépôt et self-storage"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
