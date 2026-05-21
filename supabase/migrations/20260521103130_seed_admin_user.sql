
/*
  # Seed Admin User

  Creates the initial admin user with:
  - Proper auth.users entry with bcrypt password hash
  - Matching auth.identities row for email provider
  - Profile row with role = admin

  Password: Admin@2026!
  The bcrypt hash below was generated for that password.
*/

DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
BEGIN
  -- Only insert if not already present
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@internhub.com') THEN

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      phone_change_sent_at,
      email_change_token_current,
      email_change_confirm_status,
      banned_until,
      reauthentication_token,
      reauthentication_sent_at,
      is_sso_user,
      deleted_at
    ) VALUES (
      admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@internhub.com',
      crypt('Admin@2026!', gen_salt('bf')),
      now(),
      NULL,
      '',
      NULL,
      '',
      NULL,
      '',
      '',
      NULL,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Admin User","role":"admin"}',
      false,
      now(),
      now(),
      NULL,
      NULL,
      '',
      '',
      NULL,
      '',
      0,
      NULL,
      '',
      NULL,
      false,
      NULL
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      provider_id
    ) VALUES (
      gen_random_uuid(),
      admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@internhub.com', 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now(),
      now(),
      admin_id::text
    );

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (admin_id, 'admin@internhub.com', 'Admin User', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Admin User';

  END IF;
END $$;
