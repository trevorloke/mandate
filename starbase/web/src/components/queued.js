// What a knock that went to the outbox (src/offline.js) says — the same words
// on every field screen: the door card, the walk list, Calls, the profile.
//   phone offline              → "Saved offline"
//   sign-in lapsed (401)       → "Saved on this phone — sign in to send"
//   signal, but no server reply → "Saved on this phone — sends soon"
// The knock IS kept in every case (and sent once later), so none of them
// says "try again": a second tap would log it twice.
// r: logContact's answer ({ queued, signedOut }). what: an optional noun
// ("Note" → "Note saved offline").
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function queuedText(r, what = '') {
  const tail = isOffline()
    ? 'saved offline'
    : r?.signedOut ? 'saved on this phone — sign in to send' : 'saved on this phone — sends soon';
  return what ? `${what} ${tail}` : tail.charAt(0).toUpperCase() + tail.slice(1);
}

// A knock's toast when it's on the phone: what was saved first, then where —
// "Rated 1 · Strong yes · 3 answers · Saved offline".
export const queuedSaid = (r, ...said) => [...said.filter(Boolean), queuedText(r)].join(' · ');

// The chip on a row whose knock hasn't reached the server yet; `short` for a
// list row, where the address and names need the room.
export const queuedChip = (short = false) => (isOffline()
  ? (short ? 'Offline' : 'Saved offline')
  : (short ? 'Not sent' : 'Not sent yet'));
