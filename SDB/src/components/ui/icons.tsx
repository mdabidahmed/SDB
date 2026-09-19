interface IconProps {
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

const base = ({ size = 18 }: IconProps): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

export const MenuIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const SearchIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const SunIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
  </svg>
);

export const MoonIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4a8.2 8.2 0 0 0-1.9 1A8 8 0 0 0 19 15.4a8.2 8.2 0 0 0 1-1.9Z" />
  </svg>
);

export const ChevronIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const ArrowLeftIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
);

export const ArrowRightIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="M5 12h14m0 0-6-6m6 6-6 6" />
  </svg>
);

export const CloseIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const BookIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 18.5Z" />
    <path d="M8 4v16" />
  </svg>
);

export const SettingsIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const CornerDownLeftIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base(props)} className={props.className}>
    <path d="M19 5v7a3 3 0 0 1-3 3H6m0 0 4-4m-4 4 4 4" />
  </svg>
);
