# Gupit Xpress — Redesigned

A redesigned version of the Gupit Xpress barbershop website and staff dashboard.
The **backend, API, data format, booking/queue logic and authentication are the same as the original project** —
only the interface (HTML, CSS and the dashboard rendering in `script.js`) was redesigned.

- **Public site:** home, 4-step online booking, haircut styles, barbers, photo/video gallery, reviews, contact.
- **Staff dashboard:** sign in with the admin passcode to see the queue, the next customer, statistics, customer records,
  receipts, and the gallery / photo / GCash QR management tools.

---

## 1. What you need

| Requirement | Notes |
|---|---|
| **Node.js 18 or newer** | Download the LTS version from <https://nodejs.org>. |
| **Visual Studio Code** | <https://code.visualstudio.com> |
| A web browser | Chrome, Edge, Firefox or Safari. |

There is **no database to install and no `npm install` to run** — the project has no dependencies.
Data is stored in a JSON file (`data/site-data.json`), exactly like the original.

Check Node is installed: open a terminal and run `node -v` (it should print `v18` or higher).

## 2. Open the project in VS Code

1. Extract the ZIP.
2. In VS Code choose **File → Open Folder…** and select the **`GupitXpress_Redesigned`** folder.
3. Open the built-in terminal with **Terminal → New Terminal** (shortcut: `` Ctrl+` ``).

## 3. Start the server

The server **refuses to start without an admin passcode** (same as the original). Choose any long, private passcode —
you will type it on the Staff Login screen. Do not share it and do not save it in any file in the project.

### Option A — VS Code Run button (easiest)
1. Open the **Run and Debug** panel (`Ctrl+Shift+D`).
2. Pick **Run Gupit Xpress (asks for admin passcode)** and press **F5**.
3. Type your passcode in the prompt at the top of the window.

### Option B — Terminal
**Windows PowerShell**
```powershell
$env:ADMIN_PASSCODE = "choose-a-long-private-passcode"
node server.js
```
**Windows Command Prompt**
```bat
set ADMIN_PASSCODE=choose-a-long-private-passcode
node server.js
```
**macOS / Linux**
```bash
ADMIN_PASSCODE="choose-a-long-private-passcode" node server.js
```

### Option C — Double-click launcher
- Windows: double-click **`start.bat`** · macOS/Linux: run `./start.sh`
- It asks for the passcode and then starts the server.

## 4. Open the website

When the terminal prints `Gupit Xpress is running at http://127.0.0.1:3000`, open:

**<http://127.0.0.1:3000>**

Do **not** open `index.html` by double-clicking it — booking, reviews, the gallery and the admin tools need the server.

To use another port, set `PORT` first (for example `$env:PORT = "4000"` in PowerShell) and open that port instead.
Stop the server with `Ctrl+C`.

## 5. Staff / admin login

1. Scroll to the footer and click **Staff Login** (or open `http://127.0.0.1:3000/#admin-panel`).
2. Enter the passcode you chose when starting the server and press **Open dashboard**.

Inside the dashboard:

| Sidebar item | What it does |
|---|---|
| **Overview** | Waiting / served / today / total bookings, booked total, next customer, breakdown by barber and payment type. |
| **Customer Queue** | Waiting customers in queue order with a **Call next** button (marks the customer as served). |
| **Customer Records** | Every booking with search, status filter, receipt viewer, **Delete**, and *Erase last 7 / 30 days*. |
| **Gallery posts / Haircut photos / Barber photos** | Jump to those sections on the website, where the admin-only upload controls appear. |
| **GCash QR code** | Opens the GCash window where the QR image can be uploaded. |
| **View website** | Leaves the dashboard but keeps you signed in. A floating **Dashboard** button brings it back. |
| **Sign out** | Ends the admin session. |

## 6. Your existing data

`data/site-data.json` is the same file/format as the original project and **currently contains the data from the original ZIP**
(bookings, reviews and gallery posts). To start fresh, replace its contents with:

```json
{ "bookings": [], "reviews": [], "gallery": [] }
```

To keep using live data from the original project, copy that project's `data/site-data.json` over this one while the server is stopped.
Back this file up regularly.

## 7. Project structure

```
GupitXpress_Redesigned/
├── index.html          Page markup (public site + staff dashboard)
├── style.css           The complete redesigned stylesheet
├── script.js           Site logic (booking, gallery, reviews) + dashboard rendering
├── server.js           Node.js server and API (unchanged from the original)
├── package.json        "npm start" script
├── data/site-data.json Data store (same schema as the original)
├── assets/cuts/        Original logos and haircut photos (unchanged)
├── .vscode/            Run configuration for VS Code
├── start.bat / start.sh  Optional launchers
└── README.md
```

## 8. What changed from the original

- **New visual design** (charcoal / white / light-gray with a deep-red accent), new navigation, hero, booking wizard,
  cards, forms, modals, toasts and footer — responsive from phones to wide desktops.
- **Staff dashboard rebuilt** as a full-screen console with sidebar, stat cards, next-customer card, queue list and a searchable records table.
  All figures are calculated from the real bookings returned by `/api/admin/bookings`; nothing is invented.
- **Fixes**
  - The "ADMIN" word in the original dashboard heading was white-on-light and invisible.
  - Posting a review threw `Cannot read properties of null (reading 'reset')`, so the form never reset and the thank-you message never appeared.
  - Stray/unbalanced `</div>` tags around the booking card were corrected.
  - Footer "Admin" link is now labelled **Staff Login** (same `#admin-open-link` behaviour).
- **Unchanged:** `server.js`, every API route, the data schema, queue numbering, the booking rules (one booking per slot), admin sessions, and all logos/photos.

## 9. Known limitations (inherited from the original design)

- Haircut photos, barber photos and the GCash QR image uploaded by an admin are saved in **that browser's `localStorage`**,
  not on the server, so other visitors do not see them. Gallery posts **are** stored on the server. Fixing this requires a backend change.
- The page loads the *Inter* and *Barlow Condensed* fonts from Google Fonts. Offline, the browser falls back to system fonts (layout still works).
- The admin session token is kept in `sessionStorage`, so closing the browser tab signs you out.
- Videos in the gallery cannot be deleted from the interface (the original only shows the delete button on photos); the API supports it.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `node` is not recognized | Install Node.js 18+ from nodejs.org, then close and reopen VS Code. |
| `Set ADMIN_PASSCODE before starting the server.` | Start with one of the methods in section 3 so the passcode is set. |
| `EADDRINUSE` / port already in use | Another program uses port 3000. Stop it, or set a different `PORT`. |
| Site opens but bookings, gallery or reviews fail | You opened `index.html` directly. Use `http://127.0.0.1:3000` with the server running. |
| "That admin passcode is not correct." | Use the exact passcode you set for the current server run. Restarting with a different one changes it. |
| "Your admin session has expired" | Sign in again (sessions end when the server restarts or the tab closes). |
| Page looks unstyled | Hard-refresh with `Ctrl+Shift+R`; make sure you opened the folder that contains `style.css`. |
| Gallery upload rejected | Files must be JPG, PNG, WebP, MP4, WebM or MOV and 20 MB or smaller. |

## 11. Deploying

Set `PORT` and `ADMIN_PASSCODE` as environment variables in your hosting provider and run `npm start`.
Use a long random passcode and serve the site over HTTPS.
