# DeployGuide workspace

The complete Next.js project is in [deployguide](./deployguide).

```powershell
cd D:\Projects\DeployGuide\deployguide
npm ci
npm run dev
```

- Local preview: http://127.0.0.1:3000
- Production export preview: run `npm run build` then `npm run preview`, and open http://127.0.0.1:4173. Stop with Ctrl+C.
- Setup, architecture and content maintenance: [deployguide/README.md](./deployguide/README.md)
- Verification record: [deployguide/VALIDATION.md](./deployguide/VALIDATION.md)
- Complete source archive: `DeployGuide-source.zip`
- Static export archive: `DeployGuide-static.zip` (serve the contents of its `out` folder)

This project is kept local at the user's request.

The simplified guide contains 5 steps for HTML, 6 for static builds, and 7 for server applications. Reference material and conditional Laravel work are separate from the main checklist. Use only one `npm run dev` process for this checkout; an existing development server can be reused at the URL printed by Next.js.
