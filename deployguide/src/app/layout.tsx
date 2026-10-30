import type { Metadata } from "next";
import "./globals.css";
import "./flow.css";
import "./typography.css";
export const metadata: Metadata = {
  title: "DeployGuide — From localhost to live.",
  description:
    "Understand deployment to Ubuntu with Nginx or Windows Server with IIS. Personalized guides for six stacks, PHP 8.2–8.5 and optional CI/CD automation.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="paper" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
