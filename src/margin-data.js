// Margin demo records — a live forecast contest expressed as workspace data
// (Phase 4). Derived from the seat sample fixture so "Workspace data" mode in
// Margin Setup works immediately after seeding. Clearly synthetic.
import { seatFixture } from './margin/seed.js';

export const MARGIN_CONTEST = [{
  id: 'mc-sample',
  name: 'Sample provincial contest',
  mode: 'seat',
  system: seatFixture.system,
  parties: seatFixture.parties,
  yourParty: seatFixture.yourParty,
  threshold: seatFixture.threshold,
  ledger: seatFixture.ledger,
  raise: seatFixture.raise,
  undecidedMethod: 'proportional',
}];

export const MARGIN_DISTRICTS = seatFixture.units.map((u) => ({ id: u.unit_id, ...u }));
export const MARGIN_POLLS = seatFixture.polls.map((p) => ({ id: p.poll_id, ...p }));
