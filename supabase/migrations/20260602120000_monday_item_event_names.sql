-- Post-launch forward migration for the Monday raw-tools refactor. The source
-- initial migration still contains the old monday.record.* event names because
-- applied migrations are immutable after launch; this migration moves existing
-- rows and constraints to the new monday.item.* event contract.
UPDATE public.assistant_work_items
SET kind = CASE kind
  WHEN 'monday.record.created' THEN 'monday.item.created'
  WHEN 'monday.record.updated' THEN 'monday.item.updated'
  ELSE kind
END
WHERE kind IN ('monday.record.created', 'monday.record.updated');

UPDATE public.profile_assistant_work_routes
SET event_type = CASE event_type
  WHEN 'monday.record.created' THEN 'monday.item.created'
  WHEN 'monday.record.updated' THEN 'monday.item.updated'
  ELSE event_type
END
WHERE event_type IN ('monday.record.created', 'monday.record.updated');

ALTER TABLE public.assistant_work_items
  DROP CONSTRAINT assistant_work_items_kind_check;

ALTER TABLE public.assistant_work_items
  ADD CONSTRAINT assistant_work_items_kind_check
  CHECK (
    kind = ANY (
      ARRAY[
        'google_calendar.event.changed'::text,
        'outlook_calendar.event.changed'::text,
        'gmail.email.received'::text,
        'outlook_mail.email.received'::text,
        'monday.item.created'::text,
        'monday.item.updated'::text,
        'scheduled.task'::text,
        'boldsign.signature_request.changed'::text,
        'microsoft_onedrive.file.created'::text,
        'microsoft_onedrive.file.updated'::text,
        'microsoft_onedrive.file.deleted'::text,
        'microsoft_sharepoint.file.created'::text,
        'microsoft_sharepoint.file.updated'::text,
        'microsoft_sharepoint.file.deleted'::text
      ]
    )
  );

ALTER TABLE public.profile_assistant_work_routes
  DROP CONSTRAINT profile_assistant_work_routes_event_type_check;

ALTER TABLE public.profile_assistant_work_routes
  ADD CONSTRAINT profile_assistant_work_routes_event_type_check
  CHECK (
    event_type = ANY (
      ARRAY[
        'google_calendar.event.changed'::text,
        'outlook_calendar.event.changed'::text,
        'gmail.email.received'::text,
        'outlook_mail.email.received'::text,
        'monday.item.created'::text,
        'monday.item.updated'::text,
        'boldsign.signature_request.changed'::text,
        'microsoft_onedrive.file.created'::text,
        'microsoft_onedrive.file.updated'::text,
        'microsoft_onedrive.file.deleted'::text,
        'microsoft_sharepoint.file.created'::text,
        'microsoft_sharepoint.file.updated'::text,
        'microsoft_sharepoint.file.deleted'::text
      ]
    )
  );
