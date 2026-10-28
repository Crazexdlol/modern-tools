import type { HeroImage } from '@/data/state-types'

export function StateAttribution({ image }: { image: HeroImage | null }) {
  if (!image) return null
  return (
    <p className="text-xs text-[color:var(--color-ink-muted)] text-center py-2 border-b border-black/5">
      Photo:{' '}
      <a
        href={image.sourcePageUrl}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-[color:var(--color-accent)]"
      >
        {image.attribution}
      </a>{' '}
      ({image.license})
    </p>
  )
}
