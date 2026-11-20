/** Review icons (24 px grid, 1.6 stroke unless noted). */
const PATHS = {
  signals: 'M3 12h4l3-7 4 14 3-7h4',
  panels: 'M3 10h18M11 10v10',
  revisions: 'M3 11a9 9 0 1 1 2.6 7M3 5v6h6M12 7v5l3 2',
  check: 'm5 12 4 4L19 6',
  warn: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  file: 'M14 3H6v18h12V7l-4-4v4h4M9 12h6m-6 4h6',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  arrow: 'M4 12h15m-5-5 5 5-5 5',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  copy: 'M8 8h11v13H8zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1',
  external:
    'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  folder:
    'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
} as const;
export type ReviewIconName = keyof typeof PATHS;

export function ReviewIcon({
  name,
  strokeWidth = 1.6,
}: {
  name: ReviewIconName;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'panels' && <rect x="3" y="4" width="18" height="16" rx="2" />}
      <path d={PATHS[name]} />
    </svg>
  );
}
