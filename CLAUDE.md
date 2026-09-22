@AGENTS.md

# Project notes

- Read README.md (setup, conventions) and PLAN.md (scope, data model, phases) before larger changes.
- Windows machine: Node and Git may not be on PATH in agent shells – prepend
  `C:\Program Files\nodejs;C:\Program Files\Git\cmd` to `$env:Path`.
- Run `npm run check` (messages, typecheck, lint) before committing.
- Supabase schema changes go into a new file in `supabase/migrations/`, never edit applied migrations.
- react-pdf gotchas: never set `lineHeight` on `Page` or wrapper Views (drops `render` texts), and keep
  `render` texts (page numbers) as standalone absolutely positioned `<Text>` with left/right set.
- The package is ESM (`"type": "module"`); react-pdf sub-packages are import-only.
