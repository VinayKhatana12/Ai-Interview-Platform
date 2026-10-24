// The product's mark, drawn for this product: three ledger lines of the
// interview record, the top one carrying the one data hue. Never a plain
// black square with a letter.
export function BrandMark({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="3" width="20" height="5" rx="1" fill="#1d5fbf" />
      <rect x="1" y="9" width="14" height="5" rx="1" fill="#0a0a0a" />
      <rect x="1" y="15" width="8" height="5" rx="1" fill="#0a0a0a" opacity="0.55" />
    </svg>
  )
}

export function Wordmark({ withMark = true }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium text-ink">
      {withMark && <BrandMark />}
      Interview Ledger
    </span>
  )
}
