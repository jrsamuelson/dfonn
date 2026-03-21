# ONN Scheduler

Static nursing scheduling tool for the Oncology Nurse Navigator team.

## What is in this repo

- `index.html`: the app entrypoint Netlify will serve
- `DFONN 3.5.html`: compatibility redirect to `index.html`
- `onn-netlify-storage.js`: browser adapter that prefers Netlify shared storage when available
- `netlify/functions/onn-storage.mjs`: shared storage API backed by Netlify Blobs
- `netlify.toml`: Netlify publish and header configuration

## Important data note

This app now supports two storage modes without changing the schedule data shape:

- `Netlify shared storage` when the site is deployed on Netlify and the function endpoint is available
- `localStorage` when you open `index.html` directly, or when no shared backend is available

It still supports a future injected backend via `window.onnStorageBackend`, which means the SharePoint path stays intact.

## Shared password protection

On Netlify Free, the site can use an app-level shared password instead of Netlify's paid visitor access feature.

Set these environment variables in Netlify if you want to require a shared password before the scheduler can read or write shared data:

- `ONN_SHARED_PASSWORD`: the shared site password staff will type into the login screen
- `ONN_SESSION_SECRET`: optional but recommended separate signing secret for the login cookie

If `ONN_SHARED_PASSWORD` is blank or unset, the app will stay open-access like it is now.

Important behavior:

- the static files are still publicly reachable, but the app will show a password screen and the Netlify storage function will reject unauthenticated reads and writes
- local `file://` use still works without a password and keeps using `localStorage`
- SharePoint remains a separate future backend path because auth is layered around the Netlify flow instead of changing the schedule data model

Important behavior:

- Local-only mode keeps data tied to the browser/device being used
- Shared Netlify mode stores the scheduler data centrally for everyone using that deployed site
- The app structure still uses the same `get/set/delete/list` storage contract, so a later SharePoint adapter can replace the Netlify one without changing the schedule model

## Local use

Open `index.html` in a browser.

If you want to test the shared backend locally instead of plain `localStorage`, install dependencies and run Netlify locally:

```bash
npm install
export ONN_SHARED_PASSWORD="replace-me"
export ONN_SESSION_SECRET="replace-me-too"
netlify dev
```

`netlify dev` uses its own local Blobs sandbox, so it will not read the production site's shared scheduler data.

## GitHub setup

1. Initialize a repository in this folder if you have not already.
2. Create a new GitHub repository.
3. Add that repository as `origin`.
4. Push the `main` branch.

Example:

```bash
git init -b main
git add .
git commit -m "Initial ONN Scheduler site"
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Netlify setup

1. In Netlify, choose **Add new site** -> **Import an existing project**.
2. Connect your GitHub account.
3. Select this repository.
4. Use these settings:

```text
Base directory: (leave blank)
Build command: (leave blank)
Publish directory: .
```

5. Deploy the site.
6. Netlify will bundle the function and use the Blobs-backed shared storage path for the scheduler.

## Recommended next step

If this scheduler will be used by multiple staff members at the same time, keep in mind that weekly saves are now shared and conflict-protected, but the site is still only as private as the Netlify access around it. If this needs tighter access control, the next step is restricting site access or adding authentication before wider rollout.
