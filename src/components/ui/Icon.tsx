import type { ReactNode, SVGProps } from 'react'

// One small, consistent stroke icon set (24px grid, 1.75 stroke, round caps)
// used everywhere instead of emoji, which render differently on every OS.

export type IconName =
  | 'pin'
  | 'locate'
  | 'swap'
  | 'play'
  | 'pause'
  | 'replay'
  | 'film'
  | 'sun'
  | 'sun-cloud'
  | 'cloud'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'alert'
  | 'arrow-up'
  | 'turn-left'
  | 'turn-right'
  | 'flag'
  | 'walk'
  | 'keyboard'
  | 'zoom'
  | 'search'
  | 'close'

const PATHS: Record<IconName, ReactNode> = {
  pin: (
    <>
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  swap: <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />,
  play: <path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.7" />
      <path d="M4 4v4.7h4.7" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M3 15h18M8 5v4M16 5v4M8 15v4M16 15v4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  'sun-cloud': (
    <>
      <path d="M8 3v1.5M3.5 7.5H5M4.8 4.3l1 1M11.2 4.3l-1 1" />
      <path d="M5.3 11.2A4 4 0 1 1 11.7 6.4" />
      <path d="M17 19H8.5a3.5 3.5 0 1 1 .6-6.95A5 5 0 0 1 18.8 13 3 3 0 0 1 17 19Z" />
    </>
  ),
  cloud: <path d="M17.5 19H8a4.5 4.5 0 1 1 .8-8.93A6 6 0 0 1 20.3 12 3.5 3.5 0 0 1 17.5 19Z" />,
  fog: <path d="M4 9h16M3 13h14M6 17h14" />,
  rain: (
    <>
      <path d="M17.5 15H8a4.5 4.5 0 1 1 .8-8.93A6 6 0 0 1 20.3 8 3.5 3.5 0 0 1 17.5 15Z" />
      <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" />
    </>
  ),
  snow: (
    <>
      <path d="M17.5 15H8a4.5 4.5 0 1 1 .8-8.93A6 6 0 0 1 20.3 8 3.5 3.5 0 0 1 17.5 15Z" />
      <path d="M9 19h.01M13 19h.01M17 19h.01M11 21.5h.01M15 21.5h.01" />
    </>
  ),
  storm: (
    <>
      <path d="M17.5 15H8a4.5 4.5 0 1 1 .8-8.93A6 6 0 0 1 20.3 8 3.5 3.5 0 0 1 17.5 15Z" />
      <path d="m13 15-2.5 4h3l-2 3.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  'arrow-up': <path d="M12 20V5M6 11l6-6 6 6" />,
  'turn-left': <path d="M19 20v-6a4 4 0 0 0-4-4H5M9 6l-4 4 4 4" />,
  'turn-right': <path d="M5 20v-6a4 4 0 0 1 4-4h10M15 6l4 4-4 4" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  walk: (
    <>
      <circle cx="13" cy="4" r="1.8" />
      <path d="m9 21 2.5-6.5L14 17v4M8 12l2-4.5 3 .5 2.5 3.5L18 12M11.5 14.5 12 8" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </>
  ),
  zoom: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4M11 8.5v5M8.5 11h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export default function Icon({ name, size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
