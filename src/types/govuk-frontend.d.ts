declare module "govuk-frontend" {
  export function initAll(options?: { scope?: Document | Element }): void;
  export const version: string;
}
