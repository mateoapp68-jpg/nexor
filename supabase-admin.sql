-- Agregar columna role a profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
CHECK (role IN ('user', 'admin'));

-- Marcar al usuario admin
UPDATE public.profiles
SET role = 'admin', full_name = 'Admin NEXOR'
WHERE id = '76528f2a-03b4-4f49-a309-d58be557ab63';

-- Verificar
SELECT id, full_name, email, role FROM public.profiles WHERE role = 'admin';
