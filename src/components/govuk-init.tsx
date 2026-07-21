"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function GovukInit() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    void import("govuk-frontend").then(({ initAll }) => initAll());
  }, [pathname, query]);
  return null;
}
