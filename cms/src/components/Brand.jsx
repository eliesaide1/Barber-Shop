/**
 * The shop's name and mark, in one place.
 *
 * It is drawn in the sidebar, on the sign-in screen, on the public
 * account-deletion page and in the notification preview — four places that have
 * to agree about what the shop is called and what its logo is. They did not
 * before: the name was typed out at each one, which is how a rename leaves a
 * stray `FadeRoom` in the corner of a screen nobody opens often.
 *
 * The logo is the app's own, copied from `mobile/src/assets/logo@2x.png`, so
 * the back office and the phone show the same thing rather than a scissors
 * glyph standing in for it.
 */

export const SHOP_NAME = 'VIA Barber House';

/** The mark on its own — for a tight space, like the notification preview. */
export function BrandMark({ size = 38, radius = 11 }) {
  return (
    <img
      className="brandmark"
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: radius }}
    />
  );
}

export default function Brand({ sub, size = 38, nameSize }) {
  return (
    <>
      <BrandMark size={size} />
      <div className="grow">
        <b style={nameSize ? { fontSize: nameSize } : undefined}>{SHOP_NAME}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
    </>
  );
}
