"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="govuk-error-summary"
      data-module="govuk-error-summary"
      role="alert"
      aria-labelledby="application-error-title"
      tabIndex={-1}
    >
      <h1 className="govuk-error-summary__title" id="application-error-title">
        Something went wrong
      </h1>
      <div className="govuk-error-summary__body">
        <p className="govuk-body">
          The application could not load its data. Check that PostgreSQL is
          running, then try again.
        </p>
        <button
          className="govuk-button"
          data-module="govuk-button"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
