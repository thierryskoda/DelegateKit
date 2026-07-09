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
        'google_drive.file.created'::text,
        'google_drive.file.updated'::text,
        'google_drive.file.deleted'::text,
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
        'google_drive.file.created'::text,
        'google_drive.file.updated'::text,
        'google_drive.file.deleted'::text,
        'microsoft_onedrive.file.created'::text,
        'microsoft_onedrive.file.updated'::text,
        'microsoft_onedrive.file.deleted'::text,
        'microsoft_sharepoint.file.created'::text,
        'microsoft_sharepoint.file.updated'::text,
        'microsoft_sharepoint.file.deleted'::text
      ]
    )
  );
