/** Contrat entre le Worker et le front (réponse de GET /info). */
export interface WorkerFormat {
  itag: number
  /** video : image seule, audio : son seul, muxed : image + son dans le même fichier. */
  kind: 'video' | 'audio' | 'muxed'
  /** Extension du conteneur : mp4, m4a, webm. */
  ext: string
  /** Codec vidéo ou audio, ex. avc1.640028, mp4a.40.2, opus. */
  codec: string
  height: number
  fps: number
  bitrate: number
  /** Taille en octets (0 si inconnue). */
  size: number
  /** URL googlevideo : à repasser telle quelle à GET /stream?u=. */
  url: string
}

export interface WorkerInfo {
  id: string
  title: string
  author: string
  lengthSeconds: number
  thumbnail: string
  formats: WorkerFormat[]
}

export interface WorkerError {
  error: string
  reason?: string
}
