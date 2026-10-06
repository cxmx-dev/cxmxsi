# cxmxsi.xyz

Static first page. GitHub Pages publishes the `main` branch.

## What this is

One screen: the name, a short line, and a footer that reads `BUILD 01`. `device.js` sets `device-phone`, `device-tablet`, or `device-desktop` on the page.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page |
| `site.css` | Layout |
| `device.js` | Device class |
| `favicon.svg`, `favicon.ico` | Icon |
| `CNAME` | Custom domain `cxmxsi.xyz` |

## DNS

Records live at the registrar, using the registrar's DNS.

| Name | Type | Destination |
| --- | --- | --- |
| apex | ANAME | `the Pages host` |
| `www` | CNAME | `the Pages host` |

Machine-specific notes are in `USER-NOTES.md` (not published).

## Version History

2026-10-06

- First page published from `main`.
- Apex ANAME saved at the registrar. The name had not resolved in a browser yet.
