/**
 * Switch iOS-style — hitam solid saat aktif, sesuai gaya soft-minimalism (§7).
 * Track-nya 48×28 tapi area sentuhnya dipaksa 44px tingginya (WCAG 2.5.5)
 * lewat padding vertikal + margin negatif, jadi layout gak ikut kedorong.
 */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className="-my-2 flex shrink-0 items-center py-2"
    >
      <span className="switch-track" data-on={on}>
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
