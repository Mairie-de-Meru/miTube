// Mode public : le site est publié avec un jeton GitHub à droits minimaux (Actions du seul dépôt)
// injecté au build (secret PUBLIC_TOKEN). Il est lisible par tout visiteur : ne lui donner
// aucun autre droit (voir README). Sans jeton embarqué, l'application demande un jeton (mode administrateur).
export const PUBLIC_TOKEN: string = import.meta.env?.VITE_PUBLIC_TOKEN ?? ''
/** `propriétaire/dépôt`, uniquement utile hors github.io (tests locaux). */
export const PUBLIC_REPO: string = import.meta.env?.VITE_PUBLIC_REPO ?? ''
export const IS_PUBLIC = PUBLIC_TOKEN !== ''
