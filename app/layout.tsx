import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ClipboardCheck, Gauge, Wrench } from "lucide-react";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  return {
    metadataBase: new URL(origin),
    title: {
      default: "TABReady — Report Readiness",
      template: "%s · TABReady",
    },
    description:
      "Deterministic report-readiness checks for HVAC Test & Balance teams.",
    icons: {
      icon: "/favicon.svg",
    },
    openGraph: {
      title: "TABReady",
      description: "Report readiness, without the spreadsheet chase.",
      images: [{ url: "/og.png", width: 1732, height: 908 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "TABReady",
      description: "Report readiness, without the spreadsheet chase.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <Gauge size={20} strokeWidth={2.2} />
              </span>
              <span>
                <b>TABReady</b>
                <small>Report readiness workspace</small>
              </span>
            </Link>
            <nav aria-label="Primary navigation">
              <Link href="/">
                <ClipboardCheck size={16} />
                Projects
              </Link>
              <Link href="/instruments">
                <Wrench size={16} />
                Instruments
              </Link>
            </nav>
            <div className="demo-environment">
              <span />
              Demo environment · synthetic data only
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
