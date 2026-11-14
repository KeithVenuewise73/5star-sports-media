/* Photo Review: where to find the review area.
   PUBLIC values only (the project address and its public sign-in key). Never put a
   secret here. The review service itself decides who may do anything. */
window.REVIEW_CONFIG = {
  supabaseUrl: 'https://mvvtngiopdrgiedjmhfb.supabase.co',
  anonKey: 'sb_publishable_wdsnPSUYCf9RtjrDb4AJcw_qMLC5ISV',
  serviceUrl: 'https://mvvtngiopdrgiedjmhfb.supabase.co/functions/v1/media-review',
  /* How long a visitor's browser remembers which pages are on. A switch takes effect within this
     time (and the service's own one-minute cache). */
  pageCacheSeconds: 60
};
