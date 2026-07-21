"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="govuk-button govuk-button--secondary"
      data-module="govuk-button"
      onClick={() => window.print()}
    >
      Print or save as PDF
    </button>
  );
}
