/** Zeile aus `volunteer_tickets_admin()` (Migration 0084). */
export type VolunteerTicketRow = {
  profile_id: string;
  person_id: string;
  display_name: string | null;
  email: string | null;
  status: string;
  coupon_status: string;
  coupon_code: string | null;
  coupon_issued_at: string | null;
  redeemed_at: string | null;
  reminded_at: string | null;
  coupon_error: string | null;
  shifts: number;
  /** Status des gezogenen Tickets — eingelöst und dann storniert ist nicht dasselbe wie eingelöst. */
  ticket_status: string | null;
};
