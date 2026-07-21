"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  ["Dashboard", "/"],
  ["Day", "/day"],
  ["Week", "/week"],
  ["Calendar", "/calendar"],
  ["Period", "/period"],
  ["Reports", "/reports"],
  ["History", "/history"],
  ["Settings", "/settings"],
] as const;

export function ServiceNavigation() {
  const pathname = usePathname();

  return (
    <div
      className="govuk-service-navigation"
      data-module="govuk-service-navigation"
    >
      <div className="govuk-width-container">
        <div className="govuk-service-navigation__container">
          <nav aria-label="Menu" className="govuk-service-navigation__wrapper">
            <button
              type="button"
              className="govuk-service-navigation__toggle govuk-js-service-navigation-toggle"
              aria-controls="navigation"
              hidden
              aria-hidden="true"
            >
              Menu
            </button>
            <ul className="govuk-service-navigation__list" id="navigation">
              {navigation.map(([label, href]) => {
                const current =
                  href === "/" ? pathname === href : pathname.startsWith(href);
                return (
                  <li
                    className={`govuk-service-navigation__item${current ? " govuk-service-navigation__item--active" : ""}`}
                    key={href}
                  >
                    <Link
                      className="govuk-service-navigation__link"
                      href={href}
                      aria-current={current ? "page" : undefined}
                    >
                      {current ? (
                        <strong className="govuk-service-navigation__active-fallback">
                          {label}
                        </strong>
                      ) : (
                        label
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
