# Frontend Structure

This frontend is intentionally split by responsibility while keeping the existing no-build browser runtime.

```text
config/      Shared constants, labels, and translations
core/        Runtime helpers, navigation, formatting wrappers, and reusable layout helpers
api/         API client wrappers
components/  Reusable HTML component helpers
pages/       Feature pages grouped by business domain
router.js    URL-to-page routing
```

`frontend/app.js` should stay small. Put feature code in `pages/`, shared UI/runtime code in `core/`, and shared labels/configuration in `config/`.
