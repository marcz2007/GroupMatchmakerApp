-- Create the storage bucket for group images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-images',
  'group-images',
  true, -- Make it public for easier testing
  52428800, -- 50MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'] -- Allowed image types
)
ON CONFLICT (id) DO NOTHING;

-- Create policy to allow authenticated users to upload files
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Allow authenticated uploads to group-images'
    ) THEN
        CREATE POLICY "Allow authenticated uploads to group-images" ON storage.objects
        FOR INSERT WITH CHECK (
          bucket_id = 'group-images' AND 
          auth.role() = 'authenticated'
        );
    END IF;
END $$;

-- Create policy to allow authenticated users to view files
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Allow authenticated downloads from group-images'
    ) THEN
        CREATE POLICY "Allow authenticated downloads from group-images" ON storage.objects
        FOR SELECT USING (
          bucket_id = 'group-images' AND 
          auth.role() = 'authenticated'
        );
    END IF;
END $$;

-- Create policy to allow authenticated users to update files
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Allow authenticated updates to group-images'
    ) THEN
        CREATE POLICY "Allow authenticated updates to group-images" ON storage.objects
        FOR UPDATE USING (
          bucket_id = 'group-images' AND 
          auth.role() = 'authenticated'
        );
    END IF;
END $$;

-- Create policy to allow authenticated users to delete files
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Allow authenticated deletes from group-images'
    ) THEN
        CREATE POLICY "Allow authenticated deletes from group-images" ON storage.objects
        FOR DELETE USING (
          bucket_id = 'group-images' AND 
          auth.role() = 'authenticated'
        );
    END IF;
END $$;

-- Create policy to allow public access to view files (optional, for public images)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Allow public downloads from group-images'
    ) THEN
        CREATE POLICY "Allow public downloads from group-images" ON storage.objects
        FOR SELECT USING (
          bucket_id = 'group-images'
        );
    END IF;
END $$; 