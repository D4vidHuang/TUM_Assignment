interface Props {
  value: number | null
  onChange: (v: number) => void
  label: string
}

export default function RatingInput({ value, onChange, label }: Props) {
  return (
    <div className="rating-row">
      <span className="rating-label">{label}</span>
      <div className="rating-group">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rating-star ${value === n ? 'active' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
