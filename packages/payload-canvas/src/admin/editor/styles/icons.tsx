'use client'

// 16 px icons for the Styles panel, drawn on a 16 x 16 grid. No icon dependency.

import type { ReactNode } from 'react'

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

type Box = [x: number, y: number, w: number, h: number]

/** Filled bars plus optional guide lines. */
function Bars({ bars, lines = [] }: { bars: Box[]; lines?: string[] }) {
  return (
    <Svg>
      {lines.map((d) => (
        <path key={d} d={d} strokeWidth={1} opacity={0.6} />
      ))}
      {bars.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={0.75} fill="currentColor" stroke="none" />
      ))}
    </Svg>
  )
}

export const ChevronIcon = () => (
  <Svg>
    <path d="m6 4 4 4-4 4" />
  </Svg>
)
export const ResetIcon = () => (
  <Svg>
    <path d="m5 5 6 6M11 5l-6 6" />
  </Svg>
)
export const SidesIcon = () => (
  <Svg>
    <path d="M3 2v12M13 2v12M2 3h12M2 13h12" strokeDasharray="2 2" />
  </Svg>
)
export const CornersIcon = () => (
  <Svg>
    <path d="M2 6V4a2 2 0 0 1 2-2h2M10 2h2a2 2 0 0 1 2 2v2M14 10v2a2 2 0 0 1-2 2h-2M6 14H4a2 2 0 0 1-2-2v-2" />
  </Svg>
)

// Display
export const DisplayBlockIcon = () => <Bars bars={[[2, 3, 12, 4], [2, 9, 12, 4]]} />
export const DisplayFlexIcon = () => <Bars bars={[[2, 3, 3, 10], [6.5, 3, 3, 10], [11, 3, 3, 10]]} />
export const DisplayGridIcon = () => <Bars bars={[[2, 2, 5, 5], [9, 2, 5, 5], [2, 9, 5, 5], [9, 9, 5, 5]]} />
export const DisplayInlineIcon = () => <Bars bars={[[2, 6, 4, 4], [7, 6, 4, 4]]} lines={['M2 12h12']} />
export const DisplayNoneIcon = () => (
  <Svg>
    <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" />
    <path d="m3 13 10-10" />
  </Svg>
)

// Flex direction (arrows)
const arrow = (d: string) => () => (
  <Svg>
    <path d={d} />
  </Svg>
)
export const ArrowRightIcon = arrow('M2 8h12m-4-4 4 4-4 4')
export const ArrowDownIcon = arrow('M8 2v12m-4-4 4 4 4-4')
export const ArrowLeftIcon = arrow('M14 8H2m4-4L2 8l4 4')
export const ArrowUpIcon = arrow('M8 14V2M4 6l4-4 4 4')
export const WrapIcon = arrow('M2 4h9a3 3 0 0 1 0 6H6m2-2-2 2 2 2M2 13h4')
export const NoWrapIcon = arrow('M2 8h12M2 4v8')

// Justify content (main axis = x). Edge lines show the container.
const edges = ['M1 2v12', 'M15 2v12']
export const JustifyStartIcon = () => <Bars bars={[[2.5, 4, 3, 8], [6.5, 4, 3, 8]]} lines={edges} />
export const JustifyCenterIcon = () => <Bars bars={[[4.5, 4, 3, 8], [8.5, 4, 3, 8]]} lines={edges} />
export const JustifyEndIcon = () => <Bars bars={[[6.5, 4, 3, 8], [10.5, 4, 3, 8]]} lines={edges} />
export const JustifyBetweenIcon = () => <Bars bars={[[2.5, 4, 3, 8], [10.5, 4, 3, 8]]} lines={edges} />
export const JustifyAroundIcon = () => <Bars bars={[[3.5, 4, 3, 8], [9.5, 4, 3, 8]]} lines={edges} />
export const JustifyEvenlyIcon = () => <Bars bars={[[2.5, 4, 2.5, 8], [6.75, 4, 2.5, 8], [11, 4, 2.5, 8]]} lines={edges} />

// Align items (cross axis = y)
const rails = ['M2 1h12', 'M2 15h12']
export const AlignStartIcon = () => <Bars bars={[[3.5, 2.5, 3.5, 6], [9, 2.5, 3.5, 9]]} lines={rails} />
export const AlignCenterIcon = () => <Bars bars={[[3.5, 5, 3.5, 6], [9, 3.5, 3.5, 9]]} lines={rails} />
export const AlignEndIcon = () => <Bars bars={[[3.5, 7.5, 3.5, 6], [9, 4.5, 3.5, 9]]} lines={rails} />
export const AlignStretchIcon = () => <Bars bars={[[3.5, 2.5, 3.5, 11], [9, 2.5, 3.5, 11]]} lines={rails} />
export const AlignBaselineIcon = () => <Bars bars={[[3.5, 4, 3.5, 6], [9, 2.5, 3.5, 9]]} lines={[...rails, 'M1 7.5h14']} />

// Text align
const lines = (d: string) => () => (
  <Svg>
    <path d={d} />
  </Svg>
)
export const TextLeftIcon = lines('M2 3h12M2 6.5h8M2 10h12M2 13.5h7')
export const TextCenterIcon = lines('M2 3h12M4 6.5h8M2 10h12M4.5 13.5h7')
export const TextRightIcon = lines('M2 3h12M6 6.5h8M2 10h12M7 13.5h7')
export const TextJustifyIcon = lines('M2 3h12M2 6.5h12M2 10h12M2 13.5h12')
