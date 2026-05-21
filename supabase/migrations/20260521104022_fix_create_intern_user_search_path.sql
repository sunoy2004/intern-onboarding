
/*
  # Fix create_intern_user search path

  pgcrypto functions (gen_salt, crypt) live in the 'extensions' schema.
  Add it to the function's search_path.
*/

CREATE OR REPLACE FUNCTION public.create_intern_user(
  p_email text,
  p_password text,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    email_change_confirm_status,
    is_sso_user,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', 'intern'),
    false,
    now(),
    now(),
    '', '', '', '', '', 0, false, '', '', ''
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
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now(),
    v_user_id::text
  );

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_intern_user(text, text, text) TO service_role;
