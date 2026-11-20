import brandIcon from '../../../../../assets/branding/dvdash/icon.svg';
import './BrandMark.css';

/** The DVDash app icon, beside the wordmark text. It is decorative: the text or the surrounding control names it. */
export function BrandMark({ size = 34 }: { size?: 28 | 34 }) {
  return (
    <span
      className="dv-brand-mark"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img src={brandIcon} alt="" />
    </span>
  );
}
