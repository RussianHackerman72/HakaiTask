/** Switch iOS-style — hitam solid saat aktif, sesuai gaya bold-minimalism (§7). */
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
      className="switch-track"
      data-on={on}
    >
      <span className="switch-thumb" />
    </button>
  );
}
