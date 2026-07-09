delete from profile_capabilities old_capability
where old_capability.capability_slug = 'web-browser'
  and exists (
    select 1
    from profile_capabilities new_capability
    where new_capability.profile_id = old_capability.profile_id
      and new_capability.capability_slug = 'public-web'
  );

update profile_capabilities
set capability_slug = 'public-web'
where capability_slug = 'web-browser';
