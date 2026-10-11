// [11 Oct] TRIAL RUN. Daisy: "we're not using the camera in the app ... I
// just want to run alongside and test the app on a day-after basis ... for a
// month or so to see how it flows with the kiln and everything else ... the
// actual pricing is kind of not really relevant at the moment, so it kind of
// is getting in the way."
//
// While the trial is on:
// - the money side stays out of the way: no prices, no "guess" labels, no
//   "to check" counts, no till comparisons. Shape names and descriptions
//   still show, because they are how a piece is found on a shelf.
// - the in-app camera is not offered as the next step; table photos arrive
//   from the iPad and land on their cards by themselves.
// Nothing is deleted. Set NEXT_PUBLIC_TRIAL_RUN=false on glazeup-api when
// going live and it all comes back.
export const TRIAL_RUN = process.env.NEXT_PUBLIC_TRIAL_RUN !== 'false';
export const SHOW_PRICES = !TRIAL_RUN;
