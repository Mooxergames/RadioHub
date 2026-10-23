# Unverified Station Countries

The retained catalogue can contain the same broadcast with incompatible country
labels. The editor previously offered only real countries, making it impossible
to remove an unsupported label without selecting another potentially false one.

The country selector now has an explicit `Unknown / not verified` option.
Selecting it submits empty country and countryCode fields together. It leaves
region, streams, articles, indexing, identifiers and redirects untouched. An
untouched unknown value is not submitted. Normal verified-country selection
continues to set both name and code.

This is a manual metadata repair control, not an automatic country inference,
noindex bypass or declaration that existing country claims are verified.

Verification: 26 station-form tests; full web suite 2,313 passed; web types and
production build passed. API behavior is unchanged and already accepts explicit
empty text fields. Production application requires a separately observed release.
