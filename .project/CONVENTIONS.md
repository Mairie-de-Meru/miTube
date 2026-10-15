# Conventions

- Une branche = une PR ; pas de merge sans accord de l'utilisateur.
- UI et README : français et anglais (i18n maison), libellés d'options en anglais comme MeTube.
- Aucune ressource externe chargée par le site (pas de CDN, pas de police distante) ; seule api.github.com est appelée.
- Les entrées du workflow ne sont jamais interpolées dans un `run:` (passer par `env:`).
- Tout changement des options côté `catalog.ts` impose le même changement dans `scripts/ytdl_opts.py` et ses tests.
