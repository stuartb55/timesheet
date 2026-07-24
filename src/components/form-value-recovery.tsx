"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const storageKey = "flexitime-pending-form";

type StoredForm = {
  path: string;
  formIndex: number;
  fields: Array<{
    elementIndex: number;
    id?: string;
    value: string;
    checked?: boolean;
  }>;
};

export function FormValueRecovery() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(query);
    let restoreTimer: number | undefined;
    if (params.has("error")) {
      const restore = () => {
        try {
          const stored = JSON.parse(
            sessionStorage.getItem(storageKey) ?? "null",
          ) as StoredForm | null;
          if (stored?.path === pathname) {
            const form = document.forms.item(stored.formIndex);
            for (const field of stored.fields) {
              const control =
                (field.id ? document.getElementById(field.id) : null) ??
                form?.elements.item(field.elementIndex);
              if (
                control instanceof HTMLInputElement ||
                control instanceof HTMLTextAreaElement ||
                control instanceof HTMLSelectElement
              ) {
                control.value = field.value;
                if (
                  control instanceof HTMLInputElement &&
                  (control.type === "checkbox" || control.type === "radio")
                ) {
                  control.checked = Boolean(field.checked);
                }
              }
            }
            for (
              let parent = form?.closest("details");
              parent;
              parent = parent.parentElement?.closest("details") ?? null
            ) {
              parent.open = true;
            }
          }
        } catch {
          sessionStorage.removeItem(storageKey);
        }

        const target = params.get("errorTarget");
        const targetElement = target ? document.getElementById(target) : null;
        for (
          let parent = targetElement?.closest("details");
          parent;
          parent = parent.parentElement?.closest("details") ?? null
        ) {
          parent.open = true;
        }
      };
      restore();
      restoreTimer = window.setTimeout(restore, 100);
    } else if (params.has("success")) {
      sessionStorage.removeItem(storageKey);
    }

    const rememberForm = (form: HTMLFormElement) => {
      const fields: StoredForm["fields"] = [];
      Array.from(form.elements).forEach((control, elementIndex) => {
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        ) {
          if (control instanceof HTMLInputElement && control.type === "file") {
            return;
          }
          fields.push({
            elementIndex,
            id: control.id || undefined,
            value: control.value,
            checked:
              control instanceof HTMLInputElement &&
              (control.type === "checkbox" || control.type === "radio")
                ? control.checked
                : undefined,
          });
        }
      });
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          path: window.location.pathname,
          formIndex: Array.from(document.forms).indexOf(form),
          fields,
        } satisfies StoredForm),
      );
    };
    const rememberSubmit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement) {
        rememberForm(event.target);
      }
    };
    const rememberClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const submitter = target.closest<HTMLButtonElement | HTMLInputElement>(
        'button:not([type="button"]), input[type="submit"]',
      );
      if (submitter?.form) rememberForm(submitter.form);
    };
    document.addEventListener("submit", rememberSubmit, true);
    document.addEventListener("click", rememberClick, true);
    return () => {
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
      document.removeEventListener("submit", rememberSubmit, true);
      document.removeEventListener("click", rememberClick, true);
    };
  }, [pathname, query]);

  return null;
}
