/**
 * Error codes returned by the API and the user-facing text for each.
 * The UI never shows raw technical errors; it only maps codes to these messages.
 */
export const ERROR_MESSAGES = {
  INVALID_URL: "Please enter a valid Shopify store URL.",
  STORE_UNAVAILABLE: "We couldn't connect to this store. Please check the URL and try again.",
  NOT_SHOPIFY: "This website does not appear to be a Shopify store.",
  NO_PRODUCTS: "No publicly accessible products were found on this store.",
  PROTECTED:
    "This store appears to restrict public product access, so its catalog could not be retrieved.",
  RATE_LIMITED: "The store temporarily limited requests. Please wait a moment and try again.",
  UNKNOWN: "Something went wrong while retrieving the catalog. Please try again.",
};

export function messageFor(code) {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
}

/** Error class used on the server so route handlers can map failures to codes. */
export class StoreError extends Error {
  constructor(code, status = 400, detail) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
