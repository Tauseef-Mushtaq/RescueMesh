-- RescueMesh AI — Add reporter contact and evidence image URL columns (Migration 00000000000006)

ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS reporter_name text,
ADD COLUMN IF NOT EXISTS reporter_contact text,
ADD COLUMN IF NOT EXISTS image_url text;

-- Create public storage bucket for incident media evidence if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-evidence', 'incident-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policy allowing public uploads
CREATE POLICY "Public Incident Evidence Upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'incident-evidence');

-- Storage RLS policy allowing public reads
CREATE POLICY "Public Incident Evidence Read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'incident-evidence');
