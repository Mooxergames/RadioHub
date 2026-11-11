# Home — nearby location prompt

Read the current Home preview: Austria stations and the enable-location CTA are present. Austria can come from approximate IP country detection without GPS authorization; the list alone is not proof of granted permission.

Changed the CTA condition from missing coordinates alone to missing coordinates AND permission not granted. Authorization now removes the persistent prompt immediately, including desktop GPS failures; existing error feedback stays transient. Valid coordinates also suppress the prompt, including zero-valued coordinates. Denial retains the explicit opt-in/settings action and country discovery. Empty authorized results no longer suggest enabling an already enabled permission. Startup remains silent, with no new requests or permission prompts.

Validation: 22 nearby-discovery cases pass, including permission transitions, blocked permissions, GPS failures, country/GPS isolation and location CTA visibility. No new TypeScript diagnostics compared to the preceding baseline. No real geolocation permission was changed while checking the user preview.
