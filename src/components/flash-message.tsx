export function FlashMessage({
  success,
  error,
  errorTarget,
}: {
  success?: string | string[];
  error?: string | string[];
  errorTarget?: string | string[];
}) {
  const successMessage = Array.isArray(success) ? success[0] : success;
  const errorMessage = Array.isArray(error) ? error[0] : error;
  const target = Array.isArray(errorTarget) ? errorTarget[0] : errorTarget;
  if (errorMessage) {
    return (
      <div
        className="govuk-error-summary"
        data-module="govuk-error-summary"
        role="alert"
        aria-labelledby="error-summary-title"
        tabIndex={-1}
      >
        <h2 className="govuk-error-summary__title" id="error-summary-title">
          There is a problem
        </h2>
        <div className="govuk-error-summary__body">
          <ul className="govuk-list govuk-error-summary__list">
            <li>
              <a href={`#${target || "main-content"}`}>{errorMessage}</a>
            </li>
          </ul>
        </div>
      </div>
    );
  }
  if (successMessage) {
    return (
      <div
        className="govuk-notification-banner govuk-notification-banner--success"
        role="alert"
        aria-labelledby="success-title"
        data-module="govuk-notification-banner"
      >
        <div className="govuk-notification-banner__header">
          <h2 className="govuk-notification-banner__title" id="success-title">
            Success
          </h2>
        </div>
        <div className="govuk-notification-banner__content">
          <p className="govuk-notification-banner__heading">{successMessage}</p>
        </div>
      </div>
    );
  }
  return null;
}
