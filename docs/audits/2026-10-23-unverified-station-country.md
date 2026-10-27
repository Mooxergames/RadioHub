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

## SSR Read Pressure

The full 2,237-address HTTP review also observed three transient 503 responses.
The first independent recheck returned the expected 410. Deployment logs contain
an SEO read-budget expiration, and PostgreSQL logs contain statement timeouts.
These are real transient failures, not evidence that the affected stations are
absent. They must not be converted into permanent not-found decisions.

Station cross-link queries declared a card projection but never supplied it to
the native store. Country, region and publisher rails therefore received full
station rows, including all articles and retained source payloads. They now
request only the seven native display fields. Existing store defaults retain
ID and visibility evidence; filtering, ranking, limits and link rendering stay
unchanged. The main station lookup still loads its complete article.

The added regression checks all three projections and rendered links. The full
API suite passed 2,843 tests with nine existing skips against local PG17. This
removes an evidenced unnecessary load source; it does not claim that every
production timeout has the same cause or that all 503s are eliminated.
