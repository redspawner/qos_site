# Quinta Outeiro da Serva — website

Source of <https://quintaouteirodaserva.com>. Plain HTML pages, one stylesheet, one script and a
small Node server. There is **no build step**: what is in this repository is exactly what is served.
Railway redeploys the site automatically whenever something is committed to the main branch.

## Where things are

| Path | What it is |
| --- | --- |
| `pt.html`, `eng.html`, `fr.html` | The age-check screen of each language (`/`, `/eng`, `/fr`) |
| `pt/`, `eng/`, `fr/` | The pages of each language. `pt/index.html` is the Portuguese home page |
| `enviado.html`, `sent.html`, `envoye.html` | "Thank you" screen shown after the contact form is sent |
| `*/out*.html`, `qr.html` | Short "redirecting..." screens (leaving the site, Facebook, Instagram, QR code) |
| `stock.html`, `tp.html`, `tpp.html` | Internal / private pages (not linked from the site, hidden from Google) |
| `assets/css/main.css` | **The only stylesheet.** Part 1 is the template; part 2 (`SITE STYLES`) is ours |
| `assets/css/noscript.css` | Tiny extra used only when a visitor has JavaScript switched off |
| `assets/js/main.js` | **The only script**: opening animation, background slideshow, phone menu, gallery |
| `assets/fonts/` | Text fonts (Merriweather, Source Sans Pro), served from our own site |
| `assets/webfonts/` | Full Font Awesome icon fonts (only downloaded if a new icon is used) |
| `images/` | Every picture the site shows, already resized and compressed |
| `images/bg/` | Background slideshow photos (`NN-tall.webp` for phones, `NN-wide.webp` for computers) |
| `images/gallery/` | Gallery photos (big) and `images/gallery/thumb/` (small versions for the grid) |
| `originals/` | Full-size source files that the site does **not** use or serve (safe to move elsewhere) |
| `server.js` | The server: serves the files, contact form, visit statistics, stock form |

Addresses have no `.html`: `pt/vinho_tinto.html` is reached at `/pt/vinho_tinto`.

## How a page is put together

Every content page has the same blocks, each marked with a comment:

```
<head>            title, description, links to main.css and main.js
<div id="bg">     the background slideshow (empty; main.js fills it)
<div id="intro">  the logo screen
<nav id="nav">    the menu (main.js copies these links into the phone menu)
<div id="main">   the content of that page  <-- the part that differs between pages
<footer>          contact form, address, phones, language buttons
```

The header, menu and footer are repeated in every page. To change one of them everywhere
(a phone number, a menu entry...), open the repository on GitHub, press the `.` key to open the
editor, and use *Search > Replace in files* so that all pages change together.

## Common changes

**Change a text** — edit the `.html` file of that page, inside `<div id="main">`. Remember the
other two languages. `<br />` starts a new line; `<br class="only-desktop" />` is an extra blank
line that is ignored on phones.

**Add a photo to a page** — resize it first (see sizes below), put it in `images/` and write:

```html
<img src="/images/my-photo.webp" alt="Short description of the photo" width="1400" height="933" loading="lazy">
```

`width`/`height` are the real pixel size of the file (they stop the page from jumping while the photo
loads); `loading="lazy"` makes the browser fetch it only when the visitor scrolls near it.

**Add a gallery photo** — add two files, `images/gallery/33.webp` (big) and
`images/gallery/thumb/33.webp` (small), then copy one of the `<div class="col-6">` lines in a
gallery page and change the three numbers. To add a gallery page, copy `galeria_5.html` and add the
new page number to the `pagination` block of every gallery page.

**Change the background photos** — the list is at the top of `assets/js/main.js` (`SLIDES`),
together with how long each photo stays and how long the fade takes. Each photo needs a `-tall` and
a `-wide` file in `images/bg/`.

**Change colours, sizes, spacing** — `assets/css/main.css`, in the second part (search for
`SITE STYLES`). It has a table of contents and every block says what it is for.

### Photo sizes

Photos straight from a camera are 5–12 MB each and were the reason the site was slow. Before
uploading, shrink them (for example with the free <https://squoosh.app>, format WebP, quality ~75):

| Use | Size (pixels) | Typical weight |
| --- | --- | --- |
| Large photo in a page | 1400 wide | 100–200 KB |
| Photo beside text, product photo | 900 wide | 30–130 KB |
| Gallery photo | 1600 on the long side | 100–300 KB |
| Gallery thumbnail | 640 wide | 20–60 KB |
| Background, phones (`-tall`) | 1080 x 1920 | 60–300 KB |
| Background, computers (`-wide`) | 1080 x 720 | 40–130 KB |

When replacing a photo, give the new file a **new name**: browsers keep images for 30 days, so a
changed file with the same name would not show up for returning visitors.

## Server

`server.js` needs these settings (Railway > Variables). The values are secrets and are never stored here:

`SPREADSHEET_ID`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REFRESH_TOKEN`,
`OAUTH_USER_EMAIL`, `NOTIFY_TO` (who receives the contact form, comma separated) and, optionally,
`STOCK_USERS` (names allowed to use the stock form, comma separated).

To try the site on your own computer (Node 22 or newer):

```bash
npm install
```

```bash
npm start
```

Then open <http://localhost:8080>. Without the Google settings the pages work normally; only the
contact form, statistics and stock form cannot save anything.

## Credits

- Design based on **Massively** by [HTML5 UP](https://html5up.net) (CCA 3.0 licence, see `LICENSE.txt`).
- Icons: [Font Awesome Free 5](https://fontawesome.com) (icons CC BY 4.0, fonts SIL OFL 1.1).
- Fonts: Merriweather and Source Sans Pro (SIL Open Font License 1.1).
