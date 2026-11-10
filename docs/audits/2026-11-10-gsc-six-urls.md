# Six Historical Search Console Station URLs

Reviewed 2026-11-10. These are not the six HTTP/home/locale examples in
the separate "Page with redirect" report.

## Approved Exact Aliases

| Historical slug | Current station ID | Evidence |
| --- | --- | --- |
| `jalisco-radio-fm-ciudad-guzmn-1071-fm-xhcgj-fm-gobierno-del-estado-de-jalisco-ciudad-guzmn-jc-1` | `6a07917abef34beb9148c3cf` | The call sign XHCGJ-FM, FM frequency 107.1 MHz, Ciudad Guzman and government broadcaster identify the same service. The surviving row also owns the accented-name ASCII variant ending in `-1`. |
| `931-the-mountain-2` | `68a8c45cbd66579311aad14c` | The historical brand and frequency uniquely identify the catalog's Las Vegas station. Its former official iHeart domain redirects to NEON 93.1. Both brands identify iHeart channel 1337, KVGK-FM. This establishes service continuity, not the missing historical row's internal ID. |
| `paganradioorg-1` | `6a0791a3bef34beb9148ca80` | Individually reviewed punctuation variant of the distinctive publisher name. The publisher's dated archive identifies the existing catalog channel and its HTTP port 5560 stream. This is not a claim that the missing old internal ID was recovered. |

Primary references:

- [Jalisco broadcaster](https://jaliscoradio.com/)
- [Jalisco broadcast coverage](https://transparencia.info.jalisco.gob.mx/sites/default/files/COBERTURA%20EN%20RADIO.pdf)
- [Historical iHeart station](https://931themountain.iheart.com/)
- [Current iHeart station](https://neon931.iheart.com/)
- [Archived PaganRadio publisher](https://web.archive.org/web/20250720121852id_/https://paganradio.org/)

PaganRadio publication requires a separate one-row operational repair:
remove its unsafe former homepage from both native/source fields and use the
publisher-documented working stream through the already-existing HTTPS relay.
The relay was checked with the production page Origin and player timestamp
encoding; both delivered 156 complete MP3 frames. Do not introduce a new relay,
weaken TLS verification or infer an alternative homepage. Field-specific manual
flags protect only the three corrected provider fields from sync reversion.

The production read at 2026-11-10 16:56:48 UTC found both targets visible,
with native and source noIndex false, no redirect target and no station
metadata overrides. Jalisco's manual-field flag records that noIndex was
edited; it is not itself an active exclusion.

## Safety Contract

Use the existing exact allowlist and pin each target ID. An actual catalog
owner of the old identifier wins. A deleted, reassigned, excluded or
redirecting target must not be promoted by this repair. There is no suffix
stripping, approximate lookup, blacklist removal, new station or database
identity mutation. Locale handling remains with the established middleware
and SSR: retired-language URLs retain English content at their own address.

The tests exercise direct reads, warm cache resolution, missing/reassigned
targets, redirect loops, exclusions and exact-owner precedence.
