// Level Up HQ settings. Nothing here is secret: a Google OAuth client ID is public by design.
// Paste the client ID from SETUP.md step 4 between the quotes.
window.HQ_CONFIG = {
  GOOGLE_CLIENT_ID: "PASTE_CLIENT_ID_HERE",
  SPREADSHEET_ID: "1ugaD1dh-3CZwsGgtbyoTXG6Oh3XYDKfMRfQp0CMZW8Q",
  // Accounts that are never counted (Gavin's test logins).
  EXCLUDE_EMAIL: /^hamanngavin(\+[^@]*)?@gmail\.com$/i,
  REFRESH_MINUTES: 10,
};
