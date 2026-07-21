import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "govuk-frontend/dist/govuk/index.scss";
import { GovukInit } from "@/components/govuk-init";
import { ServiceNavigation } from "@/components/service-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Flexitime record", template: "%s – Flexitime record" },
  description:
    "A local personal flexitime record for the DTS Flexible Working Hours Scheme.",
  icons: { icon: "/assets/images/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className="govuk-template">
      <body className="govuk-template__body">
        <Suspense fallback={null}>
          <GovukInit />
        </Suspense>
        <a
          className="govuk-skip-link"
          href="#main-content"
          data-module="govuk-skip-link"
        >
          Skip to main content
        </a>
        <div className="govuk-generic-header">
          <div className="govuk-generic-header__container govuk-width-container">
            <div className="govuk-generic-header__logo">
              <Link className="govuk-generic-header__homepage-link" href="/">
                Flexitime record
              </Link>
            </div>
          </div>
        </div>
        <ServiceNavigation />
        <main
          className="govuk-width-container govuk-main-wrapper"
          id="main-content"
        >
          {children}
        </main>
        <footer className="govuk-footer">
          <div className="govuk-width-container">
            <div className="govuk-footer__meta">
              <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
                <h2 className="govuk-visually-hidden">About this service</h2>
                <div className="govuk-footer__meta-custom">
                  Personal flexitime record. Data is stored locally on this
                  device.
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
