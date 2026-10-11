# Dinatek Web UI — Recovery Notes and Preliminary Blueprint

**Purpose:** Recover the frontend structure of the web app shown in the supplied HTML, so it can inform an independent UI rewrite of Depot Management.

**Important distinction:** This report separates the Dinatek website from the previously uploaded `DOLISOFTPROdemo.zip` Windows installer. They are not the same artifact.

## 1. Findings at a glance

- The supplied page is a **client-rendered React single-page application (SPA)**. The HTML body contains `<div id="root"></div>`; React populates the visible interface after the browser loads the JavaScript bundle.
- The supplied HTML explicitly references these frontend assets:
  - JavaScript entry bundle: `/assets/index-_Zig3gcU.js`
  - CSS bundle: `/assets/index-Czyef4DR.css`
- It also references the web app's public icons/PWA manifest and several web fonts (Cairo, Inter, Roboto, Open Sans, Lato, Montserrat, Playfair Display, Merriweather, Source Sans 3).
- The JavaScript bundle and its imported chunks are where most client-side route definitions, components, labels, icons, form layouts, table layouts, and client-side state live. CSS contains the design tokens and styling rules. API responses may supply data, but they are not required just to understand the page structure.
- A plain saved HTML file is therefore not a useful visual copy on its own. It is a loader for the actual app.
- The uploaded `DOLISOFTPROdemo.zip` contains only `DEMO Dolisoft PRO 12.3 Install.exe`. Its embedded installer inventory contains a native Windows executable and `.FIC`, `.NDX`, `.MMO`, `.REP`, and `.INI` files. It does **not** contain the Dinatek React bundle, CSS bundle, web page files, or web source maps. It cannot be used to extract the web UI source.

## 2. What the supplied HTML tells us

### Entry-point structure

```text
HTML document
└── body
    ├── div#root                 ← React renders the visible application here
    └── inline URL-cleanup code  ← removes malformed/preview query parameters

head
├── /assets/index-_Zig3gcU.js   ← frontend entry bundle (name from supplied snapshot)
├── /assets/index-Czyef4DR.css  ← frontend stylesheet (name from supplied snapshot)
├── /manifest.webmanifest
├── favicon / Apple touch icon
└── Google Fonts stylesheet
```

The URL-cleanup script in the HTML is bootstrapping/preview hygiene, not the app's business UI. The analytics scripts are also not part of the app's essential layout and do not need to be copied to a new implementation.

### Why Firefox's downloaded HTML looks empty

The HTML does not contain the finished page markup. React starts after `index-*.js` executes, then renders the interface into `#root`. Downloading the document without its executable bundle, stylesheet, fonts, images, and any lazy-loaded JavaScript chunks gives you a near-empty page.

The hash-like names are build fingerprints. They can change when the site is redeployed, so use the asset URLs in the **same downloaded HTML snapshot** instead of assuming these exact names will remain valid forever.

## 3. What public screenshots reveal about the UI

The public Dinatek landing page exposes real-looking application screenshots. These are useful as visual references, but not a complete inventory of every page.

### A. Documents

Reference: https://dolisoft.com/screenshots/documents.jpg

Visible structure:

1. Global search field near the top.
2. Page title **Documents** and a short description for quotes, orders, invoices, and delivery notes.
3. Summary cards for document totals and selected document categories.
4. Document-type filter tabs: all, quotes, purchase orders (BC), delivery notes (BL), invoices.
5. A data table with at least reference, type, client, and date columns.
6. A top-right primary action for document creation appears to be present, though the provided public image does not fully show its label.

### B. Distribution dashboard

Reference: https://dolisoft.com/screenshots/distribution.jpg

Visible structure:

1. Summary cards for delivery/route activity and money collected.
2. Customer receivables and other operational financial indicators.
3. Shortcut/action cards for warehouses, stock transfers, routes, receivables, reports, cash registers, and related distribution operations.
4. A dashboard layout built from a grid of compact cards with icons, titles, and a secondary line of context.

### C. Production dashboard

Reference: https://dolisoft.com/screenshots/production.jpg

Visible structure:

1. Global search near the top.
2. Page heading **Production** with a production-dashboard subtitle.
3. KPI cards for active recipes, orders in progress, and completed production.
4. A larger panel for recent production orders, including an explicit empty state.

### D. Old Dolisoft PRO desktop screenshots are a different UI

The following older marketing screenshots show the Windows product, not the current React website. They can inform business workflow and legacy capability, but should not be treated as the pixel-level visual target for Dinatek's web shell:

- https://dolisoft-dz.com/cdn/shop/files/6.jpg?v=1753307793 — product form
- https://dolisoft-dz.com/cdn/shop/files/7.jpg?v=1753307793 — POS screen
- https://dolisoft-dz.com/cdn/shop/files/10.jpg?v=1758227129 — sales report

## 4. Most reliable ways to recover the UI

### Method 1 — Download the entry bundle and CSS directly (recommended first)

This is much simpler than copying every message in the Network panel.

The supplied HTML names the exact files from that particular snapshot. They may have changed since capture; if so, fetch the latest page and read its current `src` and `href` values.

On a machine that can reach the website:

```sh
mkdir -p ~/Downloads/dinatek-ui-capture
cd ~/Downloads/dinatek-ui-capture
curl -fL 'https://dolisoft.com/landing' -o landing.html
```

Then inspect the bundle links in the downloaded HTML:

```sh
grep -oE '(src|href)="[^"]+\.(js|css)(\?[^\"]*)?"' landing.html
```

For the exact HTML snapshot pasted in the chat, these are the asset URLs:

```sh
curl -fL 'https://dolisoft.com/assets/index-_Zig3gcU.js' -o app.bundle.js
curl -fL 'https://dolisoft.com/assets/index-Czyef4DR.css' -o app.bundle.css
```

A `404` from either command means the site has deployed a different hash; get the current path from the freshly downloaded HTML.

After downloading:

- Search the JS bundle for route names, UI labels, component names, endpoint paths, and lazy-chunk imports.
- Check the end of the JS file for a `sourceMappingURL` comment. If a matching `.map` file is publicly deployed, it may preserve original source paths and sometimes original source text. Do not assume that a source map exists.
- CSS may point to additional fonts/images. The JS bundle may import additional chunks or images; download those only if the app needs them for visual analysis.

### Method 2 — Use browser-rendered screens to make a UI inventory

For every page you can legitimately access, record its URL and capture a screenshot after the screen has finished rendering. Use the app's own links/menu, not guessed route names. For each page, note:

- shell layout and navigation
- page title/subtitle
- filters and search controls
- summary/KPI cards
- table columns and row actions
- primary and secondary actions
- modal/drawer forms
- empty/loading/error states
- responsive behavior

This method is often faster for a UI rewrite than trying to reconstruct minified JavaScript first.

### Method 3 — Mirror public static assets with a site downloader

HTTrack or `wget` can help collect HTML, JavaScript, CSS, images, fonts, icons, and linked public pages. However, a site mirror is not guaranteed to discover every route or every chunk of a single-page app. A mirror also does not recreate private API behavior or server-side state.

### Method 4 — Browser DevTools Network log (fallback, not the starting point)

Only use a HAR/network export if Methods 1–3 miss dynamically imported assets or required responses. Do **not** indiscriminately copy every request/response: the log can contain authentication cookies, tokens, account data, and private API responses. If exporting a HAR, sanitize it and focus on static JS/CSS/image/font resources. Never share session cookies or authorization headers.

## 5. What can and cannot be recovered

### Likely recoverable

- Browser-delivered JavaScript and CSS files that remain publicly accessible.
- UI labels, page route clues, component structure hints, client-side validation, and frontend API endpoint names present in the bundle.
- Public images/icons/fonts.
- Visible page layout and interaction behavior through the browser.
- Original source paths or source text **if** source maps were deployed publicly.

### Not guaranteed recoverable

- Original React/TypeScript source files in their original form.
- Unpublished design files, Figma files, component documentation, or build configuration.
- Server-only business rules, databases, backend source code, or private API behavior.
- All authenticated pages using only the public landing page.
- A fully working local copy just by saving the static assets; API origin, auth, environment variables, and runtime services may be required.

A minified production bundle is executable frontend code, not necessarily the original maintainable source. It may be possible to prettify it for analysis, but it does not reliably recreate the vendor's clean React component files.

## 6. Recommended next step for Depot Management

Do **not** copy the vendor's bundled JavaScript straight into Depot Management. Treat it as a reference artifact. The clean path is:

1. Download the entry JS and CSS from the exact HTML snapshot.
2. Upload `landing.html`, `app.bundle.js`, and `app.bundle.css` for analysis.
3. If a source map exists, include it; if there are lazy-loaded chunk files, include the referenced chunks as well.
4. Build a page-by-page UI blueprint with screenshots, navigation, component inventory, and interaction rules.
5. Reimplement those patterns with original React components and the Depot project's own business services/API. Keep the existing domain logic separate from the redesigned UI.

This avoids a costly attempt to turn a third-party minified bundle into the new app and keeps the replacement UI maintainable.

## 7. Public references

- Dinatek web app / landing page: https://dolisoft.com/landing
- Public documents screenshot: https://dolisoft.com/screenshots/documents.jpg
- Public distribution screenshot: https://dolisoft.com/screenshots/distribution.jpg
- Public production screenshot: https://dolisoft.com/screenshots/production.jpg
- Legacy Dolisoft PRO page: https://demo.dolisoft.com/demodolisoft.html
- Legacy Dolisoft PRO product-form screenshot: https://dolisoft-dz.com/cdn/shop/files/6.jpg?v=1753307793
- Legacy Dolisoft PRO POS screenshot: https://dolisoft-dz.com/cdn/shop/files/7.jpg?v=1753307793

**Confidence:** High for the React SPA/static asset findings, because they are explicit in the supplied HTML. Medium for screenshot-based page structure, because the images show only selected screen areas. Low/unknown for inaccessible authenticated pages and behavior not represented in the HTML, public screenshots, or a browser session.
