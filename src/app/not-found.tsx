import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1 className="govuk-heading-xl">Page not found</h1>
      <p className="govuk-body">
        The requested flexitime record could not be found.
      </p>
      <Link className="govuk-link" href="/">
        Return to the dashboard
      </Link>
    </>
  );
}
