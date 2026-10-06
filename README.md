# cxmxsi.xyz

Static page. GitHub Pages publishes the `main` branch.

## What this is

A desk with a typewriter. The paper is a search field. The letterhead reads THE SEARCH ROOM.

The empty field shows `type video for ex.` Focusing it clears the line. Leaving it empty brings the sample back. `vid`, `vids`, `video`, or `videos`, then Enter, opens the videos page. Any other query shows "Nothing filed under that." A touch device gets a Search button.

The V key on the typewriter opens the same page and plays one typewriter strike. Strike profiles live in `typewriter.js`. Only `v` is wired. Another key is a `data-key` on the desk plus an entry in `typewriterStrikes`.

## Videos

`videos.html` is the reel. The three pieces are BAD_CACHE, shrine, and weather_glad. Return goes back to the desk. Reloading the reel, including a hard refresh, also returns to the desk. Escape does too, including after a video has been clicked.

## Files

| File | Role |
| --- | --- |
| `index.html` | Desk |
| `videos.html` | Reel |
| `typewriter.js` | Key strikes |
| `site.css` | Layout |
| `device.js` | Device class |
| `assets/typewriter.png` | Desk photo |
| `videos/` | Reel files |
| `favicon.svg`, `favicon.ico` | Icon |
| `CNAME` | Custom domain |

## DNS

Records live at the registrar. The bare name uses GitHub Pages addresses. `www` is a CNAME to the Pages host for this repository.

## Version History

2026-10-06

- First page published from `main`.
- Typewriter search page replaced the first screen.
- Public notes no longer name the account or a local key file.

2026-10-06

- Search words and the V key open the reel. The three pieces are BAD_CACHE, shrine, and weather_glad.
- The V key plays its own typewriter strike.
- The search sample clears when the field is focused.
- Reload and Escape on the reel return to the desk.
