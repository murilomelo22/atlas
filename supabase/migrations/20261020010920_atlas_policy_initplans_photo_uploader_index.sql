-- Cache the caller's identity once per statement; keep all visibility rules.
alter policy atlas_trip_member_read on public.trip_members
  using (user_id = (select auth.uid()) or public.atlas_trip_role(trip_id) in ('owner','viewer','editor'));
alter policy atlas_trip_publication_read on public.trip_publications
  using (user_id = (select auth.uid()) or public.atlas_trip_publication_visible(trip_id,user_id));

-- Covers the uploader foreign key (for profile deletion and uploader lookups).
create index if not exists atlas_trip_photo_uploader on public.trip_photos(uploader_id);
