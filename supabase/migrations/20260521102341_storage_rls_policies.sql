
/*
  # Storage RLS policies for documents bucket
  Allow authenticated interns to upload their own documents
  Allow admins to view all documents
*/

CREATE POLICY "Interns can upload own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (
      SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents' AND (
      (storage.foldername(name))[1] IN (
        SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

CREATE POLICY "Users can update own documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (
      SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] IN (
      SELECT i.id::text FROM interns i WHERE i.user_id = auth.uid()
    )
  );
